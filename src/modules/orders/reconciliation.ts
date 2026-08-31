import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";
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

export type OrderCreatedReconciliation = "reconciled" | "already_synced" | "external";

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
  if (!internalOrderId) return "external";

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
