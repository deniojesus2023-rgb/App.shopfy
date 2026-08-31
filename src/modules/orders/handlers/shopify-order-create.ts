import "server-only";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/modules/audit/service";
import { NonRetryableJobError } from "@/modules/queue/errors";
import type { ShopifyOrderCreatePayload } from "@/modules/queue/types";
import { ShopifyAuthError } from "@/modules/shopify/client";
import { createShopifyOrder, findShopifyOrderByInternalTag } from "@/modules/shopify/orders";
import { getDecryptedAccessToken } from "@/modules/shopify/stores/service";
import { internalOrderTag } from "../shopify-tag";

/**
 * Worker do job SHOPIFY_ORDER_CREATE (spec item 9/17). O Order local já
 * existe e já é a fonte de verdade da venda — esta função só tenta refletir
 * isso na Shopify, com retry/backoff da fila cuidando de instabilidade
 * temporária (a Shopify é downstream, nunca bloqueia a venda).
 */
export async function processShopifyOrderCreateJob(payload: ShopifyOrderCreatePayload): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: { codLead: true, items: true, shopifyStore: true },
  });
  if (!order) {
    throw new NonRetryableJobError("Order não encontrado.");
  }

  if (order.shopifyOrderId) {
    // Já sincronizado (ex.: job reprocessado após COMPLETED por engano) —
    // idempotente, não repete a chamada.
    if (order.shopifySyncStatus !== "SYNCED") {
      await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "SYNCED" } });
    }
    return;
  }

  if (!env.SHOPIFY_ORDER_SYNC_ENABLED) {
    // Dev/test sem o interruptor ligado (spec item 32): nunca chama a
    // Shopify. O Order continua PENDING de sync — comportamento esperado e
    // documentado, não um erro. Completa o job para não empilhar retry.
    return;
  }

  const store = order.shopifyStore;
  if (store.status !== "CONNECTED") {
    await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
    throw new NonRetryableJobError("Loja Shopify não está conectada.");
  }

  await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "SYNCING" } });

  let accessToken: string;
  try {
    accessToken = await getDecryptedAccessToken(order.workspaceId, order.shopifyStoreId);
  } catch {
    await markReauthRequired(order.id, order.shopifyStoreId);
    throw new NonRetryableJobError("Token indisponível.");
  }

  const tag = internalOrderTag(order.id);

  try {
    // Reconciliação (spec item 21/6): procura antes de criar — cobre o
    // caso "Shopify criou, resposta caiu antes de persistir localmente".
    const reconciled = await findShopifyOrderByInternalTag(store.shopDomain, accessToken, tag);
    if (reconciled) {
      await persistSyncedOrder(order.id, reconciled);
      return;
    }

    const outcome = await createShopifyOrder(store.shopDomain, accessToken, {
      currency: order.currency,
      internalOrderTag: tag,
      note: `Pedido COD #${order.orderNumber}`,
      phone: order.codLead.phone,
      lineItems: order.items.map((item) => ({
        title: item.titleSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
      })),
      shippingAddress: {
        firstName: order.codLead.name,
        address1: order.codLead.address,
        city: order.codLead.city,
        province: order.codLead.state,
        country: order.codLead.country,
        phone: order.codLead.phone,
      },
    });

    if (outcome.outcome === "userErrors") {
      await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
      await logAudit({
        workspaceId: order.workspaceId,
        userId: null,
        action: "order.shopify_sync_failed",
        entityType: "Order",
        entityId: order.id,
        metadata: { errors: outcome.errors },
      });
      // userErrors é a Shopify rejeitando o CONTEÚDO da mutation —
      // retentar o mesmo payload nunca vai funcionar.
      throw new NonRetryableJobError(`Shopify rejeitou o pedido: ${outcome.errors.join("; ")}`);
    }

    await persistSyncedOrder(order.id, outcome.result);
  } catch (error) {
    if (error instanceof ShopifyAuthError) {
      await markReauthRequired(order.id, order.shopifyStoreId);
      throw new NonRetryableJobError("Reautorização necessária.");
    }
    // Throttle/timeout/5xx: deixa subir — a fila retenta com backoff.
    throw error;
  }
}

async function persistSyncedOrder(
  orderId: string,
  result: { shopifyOrderId: string; shopifyOrderName: string; shopifyCreatedAt: string }
): Promise<void> {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      shopifyOrderId: result.shopifyOrderId,
      shopifyOrderName: result.shopifyOrderName,
      shopifySyncStatus: "SYNCED",
      shopifyCreatedAt: new Date(result.shopifyCreatedAt),
    },
  });

  await logAudit({
    workspaceId: order.workspaceId,
    userId: null,
    action: "order.shopify_synced",
    entityType: "Order",
    entityId: order.id,
    metadata: { shopifyOrderId: result.shopifyOrderId, shopifyOrderName: result.shopifyOrderName },
  });
}

async function markReauthRequired(orderId: string, shopifyStoreId: string): Promise<void> {
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { shopifySyncStatus: "REAUTH_REQUIRED" } }),
    prisma.shopifyStore.update({ where: { id: shopifyStoreId }, data: { status: "REAUTH_REQUIRED" } }),
  ]);
}
