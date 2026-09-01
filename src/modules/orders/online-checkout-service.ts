import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/modules/audit/service";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { redactOrderFields } from "@/modules/shared/redact";
import { isCheckoutProviderReady } from "../funnels/config/checkout-provider";
import { parseFunnelConfig } from "../funnels/config/parse";
import type { OfferItem, PaymentMethodConfig } from "../funnels/config/steps";
import { createDraftOrder, findDraftOrdersByIdentity } from "@/modules/shopify/draft-orders";
import { getDecryptedAccessToken } from "@/modules/shopify/stores/service";
import { ONLINE_CHECKOUT_ATTRIBUTE_KEY, onlineCheckoutIdentity } from "./online-checkout-identity";
import { calculateOrderQuote } from "./pricing";
import { buildShopifyLineItems } from "./shopify-line-items";
import type { StartOnlineCheckoutInput, StartOnlineCheckoutResponse } from "./schemas";
import { isVersionEligibleForCheckout } from "./version-window";

/**
 * Janela de validade do checkout. Depois disso a tentativa é considerada
 * EXPIRED e um novo clique gera um novo draft order — evita mandar um
 * cliente para um checkout montado com um quote de dias atrás.
 */
const CHECKOUT_TTL_MS = 60 * 60 * 1000;

/**
 * Fase 4D — inicia um checkout ONLINE via Draft Order + invoiceUrl.
 *
 * O que este fluxo deliberadamente NÃO faz (item 5/12/14):
 *   - não cria Order local (nenhum pedido existe antes do pagamento);
 *   - não usa o job SHOPIFY_ORDER_CREATE (aquilo é exclusivo do COD);
 *   - não trata o redirect do browser como prova de pagamento.
 * O Order local ONLINE só nasce depois, pela reconciliação do webhook
 * `orders/create` (modules/orders/reconciliation.ts).
 */
export async function startOnlineCheckout(
  input: StartOnlineCheckoutInput
): Promise<StartOnlineCheckoutResponse> {
  const funnel = await prisma.funnel.findUnique({
    where: { publicId: input.funnelPublicId },
    select: {
      id: true,
      workspaceId: true,
      shopifyStoreId: true,
      status: true,
      publishedVersionId: true,
      shopifyStore: { select: { shopDomain: true, status: true, currency: true } },
    },
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

  // Método de pagamento: resolvido SEMPRE do config publicado — o client
  // manda só a identidade (item 1). ONLINE aqui é obrigatório: este
  // endpoint nunca serve COD (que continua no fluxo próprio).
  const paymentChoiceStep = config.steps.find((s) => s.type === "PAYMENT_CHOICE" && s.enabled);
  if (!paymentChoiceStep || paymentChoiceStep.type !== "PAYMENT_CHOICE") {
    throw new ValidationError("Este funil não oferece pagamento en línea.");
  }
  const paymentMethod: PaymentMethodConfig | undefined = paymentChoiceStep.config.paymentMethods.find(
    (m) => m.id === input.selectedPaymentMethodId
  );
  if (!paymentMethod) {
    throw new ValidationError("Método de pago inválido.");
  }
  if (!paymentMethod.enabled) {
    throw new ValidationError("Este método de pago no está disponible para este funil.");
  }
  if (paymentMethod.method !== "ONLINE" || paymentMethod.provider !== "SHOPIFY_CHECKOUT") {
    throw new ValidationError("Este método de pago no usa checkout en línea.");
  }

  // Fail closed (item 10): readiness é avaliada no servidor, com a flag e
  // o estado real da loja — nunca com o que o client acha que está pronto.
  const readiness = {
    onlineCheckoutEnabled: env.SHOPIFY_ONLINE_CHECKOUT_ENABLED,
    storeConnected: funnel.shopifyStore.status === "CONNECTED",
  };
  if (!isCheckoutProviderReady(paymentMethod.provider, readiness)) {
    throw new ValidationError("El pago en línea aún no está disponible.");
  }

  // Oferta: mesma resolução server-authoritative do fluxo COD.
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

  const quote = calculateOrderQuote({
    productSnapshot: {
      unitPrice: version.productSnapshot.unitPrice.toNumber(),
      title: version.productSnapshot.title,
      productId: version.productSnapshot.productId,
      productVariantId: version.productSnapshot.productVariantId,
      shopifyProductId: version.productSnapshot.shopifyProductId,
      shopifyVariantId: version.productSnapshot.shopifyVariantId,
      variantTitle: version.productSnapshot.variantTitle,
      sku: version.productSnapshot.sku,
    },
    offer,
    paymentMethodPricing: paymentMethod.pricing,
    currency: funnel.shopifyStore.currency,
  });

  const idempotencyKey = `${funnel.id}:${input.checkoutAttemptId}`;

  // Idempotência (item 7): mesmo attempt reutiliza o checkout existente.
  // Nunca cria um segundo draft order por duplo clique.
  const existing = await prisma.onlineCheckoutAttempt.findUnique({ where: { idempotencyKey } });
  if (existing?.checkoutUrl && existing.status === "READY" && existing.expiresAt > new Date()) {
    return { checkoutUrl: existing.checkoutUrl };
  }
  if (existing && (existing.status === "COMPLETED" || existing.status === "MANUAL_REVIEW")) {
    // Já virou pedido, ou está travado aguardando decisão humana — nunca
    // montar um checkout novo por cima.
    throw new ValidationError("Este checkout ya fue procesado.");
  }

  const attempt =
    existing ??
    (await createAttempt({
      workspaceId: funnel.workspaceId,
      shopifyStoreId: funnel.shopifyStoreId,
      funnelId: funnel.id,
      funnelVersionId: version.id,
      idempotencyKey,
      checkoutAttemptId: input.checkoutAttemptId,
      selectedOfferId: offer.id,
      selectedPaymentMethodId: paymentMethod.id,
      currency: quote.currency,
      quote,
    }));

  const identity = onlineCheckoutIdentity(attempt.id);

  let accessToken: string;
  try {
    accessToken = await getDecryptedAccessToken(funnel.workspaceId, funnel.shopifyStoreId);
  } catch {
    await markFailed(attempt.id);
    throw new ValidationError("El pago en línea aún no está disponible.");
  }

  // Marcador durável ANTES de qualquer byte sair (mesma estratégia do
  // worker de pedidos da Fase 3): se o status já era CREATING, uma
  // tentativa anterior chegou à rede e o resultado é desconhecido —
  // reconciliar antes de criar de novo.
  const needsReconciliationFirst = attempt.status === "CREATING" || attempt.status === "FAILED";
  await prisma.onlineCheckoutAttempt.update({ where: { id: attempt.id }, data: { status: "CREATING" } });

  if (needsReconciliationFirst) {
    const reconciled = await reconcileBeforeCreate(attempt.id, funnel, accessToken, identity);
    if (reconciled) return { checkoutUrl: reconciled };
  }

  try {
    const outcome = await createDraftOrder(funnel.shopifyStore.shopDomain, accessToken, {
      currency: quote.currency,
      // Projeção idêntica à do COD (Fase 4A hardening): variante real,
      // quantidade física real, distribuição determinística quando o total
      // não divide exato. `unitPrice` vira `priceOverride`.
      lineItems: buildShopifyLineItems(
        quote.items.map((item) => ({
          titleSnapshot: item.titleSnapshot,
          shopifyVariantId: item.shopifyVariantId ?? null,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        }))
      ),
      identity,
      identityAttributeKey: ONLINE_CHECKOUT_ATTRIBUTE_KEY,
      note: `Checkout online — funil ${funnel.id}`,
    });

    if (outcome.outcome === "userErrors") {
      await markFailed(attempt.id);
      await logAudit({
        workspaceId: funnel.workspaceId,
        userId: null,
        action: "online_checkout.failed",
        entityType: "OnlineCheckoutAttempt",
        entityId: attempt.id,
        metadata: { errors: outcome.errors },
      });
      throw new ValidationError("No pudimos preparar el pago en línea. Inténtalo nuevamente.");
    }

    await prisma.onlineCheckoutAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "READY",
        shopifyDraftOrderId: outcome.result.draftOrderId,
        shopifyDraftOrderName: outcome.result.draftOrderName,
        checkoutUrl: outcome.result.invoiceUrl,
      },
    });

    await logAudit({
      workspaceId: funnel.workspaceId,
      userId: null,
      action: "online_checkout.ready",
      entityType: "OnlineCheckoutAttempt",
      entityId: attempt.id,
      metadata: { draftOrderId: outcome.result.draftOrderId, total: quote.total, currency: quote.currency },
    });

    return { checkoutUrl: outcome.result.invoiceUrl };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    // Resultado ambíguo: o draft order PODE ter sido criado. O status fica
    // em CREATING de propósito — é o que obriga a próxima tentativa a
    // reconciliar antes de criar outro.
    console.error(
      "[orders] online checkout create failed",
      redactOrderFields({
        onlineCheckoutAttemptId: attempt.id,
        workspaceId: funnel.workspaceId,
        shopifyStoreId: funnel.shopifyStoreId,
        errorCode: "draft_order_create_failed",
      })
    );
    throw new ValidationError("No pudimos preparar el pago en línea. Inténtalo nuevamente.");
  }
}

async function createAttempt(input: {
  workspaceId: string;
  shopifyStoreId: string;
  funnelId: string;
  funnelVersionId: string;
  idempotencyKey: string;
  checkoutAttemptId: string;
  selectedOfferId: string;
  selectedPaymentMethodId: string;
  currency: string;
  quote: ReturnType<typeof calculateOrderQuote>;
}) {
  try {
    return await prisma.onlineCheckoutAttempt.create({
      data: {
        workspaceId: input.workspaceId,
        shopifyStoreId: input.shopifyStoreId,
        funnelId: input.funnelId,
        funnelVersionId: input.funnelVersionId,
        idempotencyKey: input.idempotencyKey,
        checkoutAttemptId: input.checkoutAttemptId,
        selectedOfferId: input.selectedOfferId,
        selectedPaymentMethodId: input.selectedPaymentMethodId,
        currency: input.currency,
        quoteSnapshot: input.quote as unknown as Prisma.InputJsonValue,
        merchandiseTotal: input.quote.total,
        status: "PENDING",
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Corrida real: dois cliques simultâneos passaram os dois pelo
      // findUnique acima. A constraint UNIQUE decide quem ganhou.
      const winner = await prisma.onlineCheckoutAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Procura na Shopify um draft order já criado com a nossa identidade,
 * antes de repetir uma criação cujo resultado é desconhecido. Retorna a
 * `checkoutUrl` quando encontra exatamente um.
 */
async function reconcileBeforeCreate(
  attemptId: string,
  funnel: { workspaceId: string; shopifyStoreId: string; shopifyStore: { shopDomain: string } },
  accessToken: string,
  identity: string
): Promise<string | null> {
  const matches = await findDraftOrdersByIdentity(funnel.shopifyStore.shopDomain, accessToken, identity);

  if (matches.length === 1) {
    await prisma.onlineCheckoutAttempt.update({
      where: { id: attemptId },
      data: {
        status: "READY",
        shopifyDraftOrderId: matches[0].draftOrderId,
        shopifyDraftOrderName: matches[0].draftOrderName,
        checkoutUrl: matches[0].invoiceUrl,
      },
    });
    return matches[0].invoiceUrl;
  }

  if (matches.length > 1) {
    // Duplicata real: uma tentativa anterior criou mais de um draft order.
    // Nunca criar outro, nunca escolher um sozinho.
    await prisma.onlineCheckoutAttempt.update({
      where: { id: attemptId },
      data: { status: "MANUAL_REVIEW" },
    });
    await logAudit({
      workspaceId: funnel.workspaceId,
      userId: null,
      action: "online_checkout.failed",
      entityType: "OnlineCheckoutAttempt",
      entityId: attemptId,
      metadata: { reason: "duplicate_draft_order", matches: matches.length },
    });
    throw new ValidationError("Este checkout necesita revisión manual.");
  }

  return null;
}

async function markFailed(attemptId: string): Promise<void> {
  await prisma.onlineCheckoutAttempt.update({ where: { id: attemptId }, data: { status: "FAILED" } });
}
