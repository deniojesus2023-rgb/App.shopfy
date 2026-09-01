import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { enqueueJobInTx } from "@/modules/queue/service";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { parseFunnelConfig } from "../funnels/config/parse";
import type { CodFormStepConfig, OfferItem } from "../funnels/config/steps";
import { calculateOrderQuote } from "./pricing";
import { normalizePhone, normalizeText } from "./normalize";
import { generateOrderPublicId } from "./public-id";
import type { SubmitCheckoutInput, SubmitCheckoutResponse } from "./schemas";
import { isVersionEligibleForCheckout } from "./version-window";

const COD_FIELD_TO_LEAD_KEY = {
  NAME: "name",
  PHONE: "phone",
  WHATSAPP: "whatsapp",
  COUNTRY: "country",
  STATE: "state",
  CITY: "city",
  ADDRESS: "address",
  ADDRESS_REFERENCE: "addressReference",
} as const;

/**
 * Endpoint público (spec item 7/8): o BACKEND resolve workspace, loja,
 * config publicado, preço e requisitos do formulário — nunca confia em
 * nada financeiro ou de identidade vindo do body. Toda a validação abaixo
 * existe para que um client malicioso não consiga: (a) comprar a um preço
 * diferente do quote do servidor, (b) burlar campo obrigatório do COD_FORM
 * publicado, (c) concluir uma compra numa versão nunca publicada, (d)
 * finalizar como ONLINE (ainda não implementado nesta fase).
 */
export async function submitCheckout(input: SubmitCheckoutInput): Promise<SubmitCheckoutResponse> {
  // Honeypot: nunca revela que foi detectado — mesma forma de erro que
  // qualquer outra falha de validação genérica.
  if (input.website && input.website.trim().length > 0) {
    throw new ValidationError("Revisa los datos ingresados.");
  }

  const funnel = await prisma.funnel.findUnique({
    where: { publicId: input.funnelPublicId },
    select: { id: true, workspaceId: true, shopifyStoreId: true, status: true, publishedVersionId: true },
  });
  if (!funnel || funnel.status !== "PUBLISHED" || !funnel.publishedVersionId) {
    throw new NotFoundError("Funil não disponível.");
  }

  const version = await prisma.funnelVersion.findFirst({
    where: { id: input.funnelVersionId, funnelId: funnel.id },
    include: { productSnapshot: true },
  });
  if (!version || !isVersionEligibleForCheckout(version, funnel.id)) {
    throw new ValidationError(
      "Esta versión del funil ya no está disponible para completar la compra. Recarga la página."
    );
  }
  if (!version.productSnapshot) {
    throw new NotFoundError("Funil não disponível.");
  }

  const config = parseFunnelConfig(version.configSchemaVersion, version.config);

  if (input.selectedPaymentMethod !== "COD") {
    // Spec item 5/30: ONLINE nunca finaliza transação real nesta fase —
    // nunca fingir pagamento. O client já deveria ter bloqueado isto antes
    // de chamar o endpoint; isto é a defesa de servidor.
    throw new ValidationError("El pago en línea aún no está disponible. Elige pago contra entrega.");
  }

  const paymentStep = config.steps.find((s) => s.type === "PAYMENT_CHOICE" && s.enabled);
  if (paymentStep && paymentStep.type === "PAYMENT_CHOICE" && !paymentStep.config.allowCod) {
    throw new ValidationError("El pago contra entrega no está disponible para este funil.");
  }

  const codFormStep = config.steps.find((s) => s.type === "COD_FORM" && s.enabled);
  if (!codFormStep || codFormStep.type !== "COD_FORM") {
    throw new ValidationError("Este funil não aceita pedidos COD.");
  }

  const leadData = buildCodLeadData(codFormStep.config, input.customer);

  // A oferta (quantidade + regra de preço) vem sempre do config PUBLICADO,
  // nunca do client — `selectedOfferId` só aponta qual delas, o resto
  // (quantity, pricing) é resolvido aqui. Sem etapa OFFER habilitada, é
  // sempre uma "oferta sintética" de 1 unidade ao preço do snapshot —
  // preserva o comportamento anterior à Fase 4A para funis sem OFFER.
  const offerStep = config.steps.find((s) => s.type === "OFFER" && s.enabled);
  let offer: OfferItem;
  if (offerStep && offerStep.type === "OFFER") {
    const found = offerStep.config.offers.find((o) => o.id === input.selectedOfferId);
    if (!found) {
      throw new ValidationError("Oferta inválida.");
    }
    offer = found;
  } else {
    offer = { id: "__default__", quantity: 1, label: "", pricing: { type: "UNIT_MULTIPLIER" } };
  }

  const shopifyStore = await prisma.shopifyStore.findUnique({
    where: { id: funnel.shopifyStoreId },
    select: { currency: true },
  });

  const quote = calculateOrderQuote({
    productSnapshot: {
      unitPrice: version.productSnapshot.unitPrice.toNumber(),
      title: version.productSnapshot.title,
      // Identidade congelada na publicação — nunca lida do catálogo ao vivo.
      productId: version.productSnapshot.productId,
      productVariantId: version.productSnapshot.productVariantId,
      shopifyProductId: version.productSnapshot.shopifyProductId,
      shopifyVariantId: version.productSnapshot.shopifyVariantId,
      variantTitle: version.productSnapshot.variantTitle,
      sku: version.productSnapshot.sku,
    },
    offer,
    currency: shopifyStore?.currency ?? "COP",
  });

  const idempotencyKey = `${funnel.id}:${input.checkoutAttemptId}`;

  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return toPublicResponse(existing);
  }

  try {
    const order = await createOrderTransaction({
      workspaceId: funnel.workspaceId,
      shopifyStoreId: funnel.shopifyStoreId,
      funnelId: funnel.id,
      funnelVersionId: version.id,
      idempotencyKey,
      currency: quote.currency,
      quote,
      leadData,
    });

    await logAudit({
      workspaceId: funnel.workspaceId,
      userId: null,
      action: "order.created",
      entityType: "Order",
      entityId: order.id,
      metadata: { publicOrderId: order.publicOrderId, total: quote.total, currency: quote.currency },
    });

    return toPublicResponse(order);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Corrida real: dois POSTs simultâneos do mesmo checkoutAttemptId
      // passaram os dois pela checagem `findUnique` acima antes de
      // qualquer um confirmar — a constraint UNIQUE decide quem "ganhou",
      // e o perdedor só precisa buscar o Order que o outro criou.
      const winner = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (winner) return toPublicResponse(winner);
    }
    throw error;
  }
}

function buildCodLeadData(
  fieldsConfig: CodFormStepConfig,
  customer: SubmitCheckoutInput["customer"]
): Record<(typeof COD_FIELD_TO_LEAD_KEY)[keyof typeof COD_FIELD_TO_LEAD_KEY], string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const field of fieldsConfig.fields) {
    if (!field.enabled) continue;
    const leadKey = COD_FIELD_TO_LEAD_KEY[field.key];
    const raw = customer[leadKey as keyof typeof customer];
    const value = raw ? normalizeText(raw) : undefined;

    if (field.required && (!value || value.length === 0)) {
      throw new ValidationError("Revisa los datos ingresados.");
    }
    result[leadKey] = value;
  }

  // name/phone/address são exigidos pelo modelo CodLead independente do
  // config do funil (é o mínimo para conseguir entregar/contatar) — se o
  // lojista desabilitou algum desses campos no COD_FORM, isto falha aqui em
  // vez de criar um CodLead com dado essencial faltando.
  if (!result.name || !result.phone || !result.country || !result.state || !result.city || !result.address) {
    throw new ValidationError("Este funil não coleta os dados mínimos exigidos para um pedido COD.");
  }

  return result as never;
}

interface CreateOrderTransactionInput {
  workspaceId: string;
  shopifyStoreId: string;
  funnelId: string;
  funnelVersionId: string;
  idempotencyKey: string;
  currency: string;
  quote: ReturnType<typeof calculateOrderQuote>;
  leadData: Record<string, string | undefined>;
}

async function createOrderTransaction(input: CreateOrderTransactionInput) {
  return prisma.$transaction(async (tx) => {
    const codLead = await tx.codLead.create({
      data: {
        workspaceId: input.workspaceId,
        shopifyStoreId: input.shopifyStoreId,
        funnelId: input.funnelId,
        funnelVersionId: input.funnelVersionId,
        name: input.leadData.name!,
        phone: input.leadData.phone!,
        whatsapp: input.leadData.whatsapp,
        country: input.leadData.country!,
        state: input.leadData.state!,
        city: input.leadData.city!,
        address: input.leadData.address!,
        addressReference: input.leadData.addressReference,
        normalizedPhone: normalizePhone(input.leadData.phone!),
      },
    });

    const order = await tx.order.create({
      data: {
        workspaceId: input.workspaceId,
        shopifyStoreId: input.shopifyStoreId,
        funnelId: input.funnelId,
        funnelVersionId: input.funnelVersionId,
        codLeadId: codLead.id,
        publicOrderId: generateOrderPublicId(),
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
        paymentMethod: "COD",
        currency: input.currency,
        subtotal: input.quote.subtotal,
        discountTotal: input.quote.discountTotal,
        shippingTotal: input.quote.shippingTotal,
        total: input.quote.total,
      },
    });

    await tx.orderItem.createMany({
      data: input.quote.items.map((item) => ({
        workspaceId: input.workspaceId,
        orderId: order.id,
        titleSnapshot: item.titleSnapshot,
        // Identidade do que foi vendido. É daqui que a futura SupplierOrder
        // lê variante + quantidade — nunca do título.
        productId: item.productId,
        productVariantId: item.productVariantId,
        shopifyProductId: item.shopifyProductId,
        shopifyVariantId: item.shopifyVariantId,
        variantTitleSnapshot: item.variantTitle,
        skuSnapshot: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineSubtotal: item.lineSubtotal,
        discountTotal: item.discountTotal,
        lineTotal: item.lineTotal,
      })),
    });

    await tx.orderStatusHistory.create({
      data: {
        workspaceId: input.workspaceId,
        orderId: order.id,
        fromStatus: null,
        toStatus: "PENDING",
        source: "STOREFRONT",
      },
    });

    // Mesma transação Postgres que cria o Order — nunca "Order criado, job
    // perdido" (spec item 14): ou os dois commitam, ou nenhum.
    await enqueueJobInTx(tx, {
      type: "SHOPIFY_ORDER_CREATE",
      workspaceId: input.workspaceId,
      payload: { orderId: order.id },
      maxAttempts: 8,
    });

    return order;
  });
}

function toPublicResponse(order: {
  publicOrderId: string;
  orderNumber: number;
  status: string;
  total: Prisma.Decimal;
  currency: string;
}): SubmitCheckoutResponse {
  return {
    publicOrderId: order.publicOrderId,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total.toString(),
    currency: order.currency,
  };
}
