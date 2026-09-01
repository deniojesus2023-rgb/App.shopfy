import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { findOnlineCheckoutIdentity } from "./online-checkout-identity";
import type { OrderQuote } from "./pricing";
import { generateOrderPublicId } from "./public-id";
import { parseOrderSourceIdentifier } from "./shopify-identity";
import { parseInternalOrderTag } from "./shopify-tag";

// Payload REST-style entregue pelo webhook (mesmo formato do resto da
// Fase 1A/1B) — tolerante ao resto do payload, extrai só o que precisamos.
// Nunca guardamos este payload bruto além do que `ShopifyWebhookEvent.payload`
// já grava (sem PII adicional aqui: nome/endereço do pedido Shopify não
// entram em nenhum campo nosso).
const orderWebhookPayloadSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  source_identifier: z.string().nullable().optional(),
  tags: z.string().optional(),
  cancelled_at: z.string().nullable().optional(),
  financial_status: z.string().nullable().optional(),
  fulfillment_status: z.string().nullable().optional(),
  // Fase 4D: é por aqui que um pedido nascido de um Draft Order nosso
  // (checkout ONLINE) se identifica — o custom attribute do draft vira
  // note attribute do pedido quando o cliente paga.
  note_attributes: z
    .array(z.object({ name: z.string().nullable().optional(), value: z.string().nullable().optional() }))
    .nullable()
    .optional(),
  currency: z.string().nullable().optional(),
});

function toOrderGid(id: number | string): string {
  return `gid://shopify/Order/${id}`;
}

function parseTags(tags: string | undefined): string[] {
  return (tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export type OrderCreatedReconciliation =
  | "reconciled"
  | "already_synced"
  | "external"
  | "online_checkout_created";

/**
 * `orders/create`: distingue (A) pedido que NÓS criamos de (B) pedido
 * criado direto na Shopify. Para (B), nunca importa/duplica: apenas
 * sinaliza "external" para o caller marcar o evento como
 * conhecido-e-ignorado.
 *
 * Identidade vem do `source_identifier` (campo que gravamos na criação e
 * que o lojista não edita pela UI). A tag continua sendo aceita como
 * FALLBACK — cobre pedidos criados antes desta mudança —, nunca como
 * fonte primária.
 */
export async function reconcileOrderCreatedWebhook(rawPayload: unknown): Promise<OrderCreatedReconciliation> {
  const payload = orderWebhookPayloadSchema.parse(rawPayload);

  const internalOrderId =
    parseOrderSourceIdentifier(payload.source_identifier) ?? parseInternalOrderTag(parseTags(payload.tags));

  if (!internalOrderId) {
    // Fase 4D: pode ser um pedido nascido de um checkout ONLINE nosso —
    // nesse caso o Order local ainda NÃO existe (nunca criamos pedido
    // antes do pagamento) e é este webhook que o cria.
    const attemptId = findOnlineCheckoutIdentity(payload.note_attributes);
    if (attemptId) {
      return reconcileOnlineCheckoutOrder(attemptId, payload);
    }
    return "external";
  }

  const order = await prisma.order.findUnique({ where: { id: internalOrderId }, select: { id: true, shopifyOrderId: true } });
  if (!order) return "external";
  if (order.shopifyOrderId) return "already_synced";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      shopifyOrderId: toOrderGid(payload.id),
      shopifyOrderName: payload.name ?? null,
      shopifySyncStatus: "SYNCED",
    },
  });
  return "reconciled";
}

/**
 * Fase 4D — o pedido pago apareceu na Shopify para uma tentativa de
 * checkout ONLINE nossa. É AQUI que o Order local ONLINE nasce: o
 * redirect do browser nunca foi prova de pagamento (item 14), só este
 * webhook é.
 *
 * Idempotente por construção: a tentativa guarda `orderId` (único), então
 * uma reentrega do mesmo webhook encontra o Order já criado e não duplica.
 * O quote congelado (`quoteSnapshot`) é a fonte dos valores — nunca
 * recalculamos preço nesta altura, exatamente como o worker do COD nunca
 * recalcula a oferta.
 */
async function reconcileOnlineCheckoutOrder(
  attemptId: string,
  payload: z.infer<typeof orderWebhookPayloadSchema>
): Promise<OrderCreatedReconciliation> {
  const attempt = await prisma.onlineCheckoutAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return "external";
  if (attempt.orderId) return "already_synced";

  const quote = attempt.quoteSnapshot as unknown as OrderQuote;
  const shopifyOrderId = toOrderGid(payload.id);

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          workspaceId: attempt.workspaceId,
          shopifyStoreId: attempt.shopifyStoreId,
          funnelId: attempt.funnelId,
          funnelVersionId: attempt.funnelVersionId,
          // Sem CodLead: no fluxo ONLINE o cliente preenche os dados
          // dentro do checkout da Shopify, não no nosso funil.
          codLeadId: null,
          publicOrderId: generateOrderPublicId(),
          // Deriva da tentativa — dois webhooks do mesmo checkout colidem
          // aqui e o segundo cai no branch de "já existe".
          idempotencyKey: `online:${attempt.id}`,
          status: "PENDING",
          paymentMethod: "ONLINE",
          checkoutProvider: "SHOPIFY_CHECKOUT",
          currency: attempt.currency,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          paymentMethodDiscount: quote.paymentMethodDiscount,
          shippingTotal: quote.shippingTotal,
          total: quote.total,
          shopifyOrderId,
          shopifyOrderName: payload.name ?? null,
          shopifySyncStatus: "SYNCED",
          shopifyCreatedAt: new Date(),
        },
      });

      await tx.orderItem.createMany({
        data: quote.items.map((item) => ({
          workspaceId: attempt.workspaceId,
          orderId: order.id,
          titleSnapshot: item.titleSnapshot,
          productId: item.productId ?? null,
          productVariantId: item.productVariantId ?? null,
          shopifyProductId: item.shopifyProductId ?? null,
          shopifyVariantId: item.shopifyVariantId ?? null,
          variantTitleSnapshot: item.variantTitle ?? null,
          skuSnapshot: item.sku ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineSubtotal: item.lineSubtotal,
          discountTotal: item.discountTotal,
          lineTotal: item.lineTotal,
        })),
      });

      await tx.orderStatusHistory.create({
        data: {
          workspaceId: attempt.workspaceId,
          orderId: order.id,
          fromStatus: null,
          toStatus: "PENDING",
          source: "SHOPIFY",
        },
      });

      await tx.onlineCheckoutAttempt.update({
        where: { id: attempt.id },
        data: { status: "COMPLETED", orderId: order.id, completedAt: new Date() },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Reentrega concorrente do mesmo webhook — o outro processamento
      // ganhou a constraint UNIQUE. Nada a fazer.
      return "already_synced";
    }
    throw error;
  }

  return "online_checkout_created";
}

export type OrderUpdatedReconciliation = "updated" | "no_change" | "not_ours";

/**
 * `orders/updated` (spec item 23): escopo travado em cancelamento e
 * fulfillment — nunca tenta mapear todo o grafo de status da Shopify.
 * Sempre gera `OrderStatusHistory(source: SHOPIFY)` quando muda `status`.
 */
export async function reconcileOrderUpdatedWebhook(rawPayload: unknown): Promise<OrderUpdatedReconciliation> {
  const payload = orderWebhookPayloadSchema.parse(rawPayload);
  const gid = toOrderGid(payload.id);

  const order = await prisma.order.findFirst({ where: { shopifyOrderId: gid } });
  if (!order) return "not_ours";

  if (payload.cancelled_at && order.status !== "CANCELLED") {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", cancelledAt: new Date(payload.cancelled_at) },
      }),
      prisma.orderStatusHistory.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "CANCELLED",
          source: "SHOPIFY",
        },
      }),
    ]);
    return "updated";
  }

  if (
    payload.fulfillment_status === "fulfilled" &&
    order.status !== "FULFILLED" &&
    order.status !== "DELIVERED" &&
    order.status !== "CANCELLED"
  ) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLED" } }),
      prisma.orderStatusHistory.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "FULFILLED",
          source: "SHOPIFY",
        },
      }),
    ]);
    return "updated";
  }

  return "no_change";
}
