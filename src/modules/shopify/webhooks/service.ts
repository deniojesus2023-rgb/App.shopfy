import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { reconcileOrderCreatedWebhook, reconcileOrderUpdatedWebhook } from "@/modules/orders/reconciliation";
import { enqueueJob } from "@/modules/queue/service";

interface PersistWebhookEventInput {
  shopDomain: string;
  topic: string;
  shopifyWebhookId: string;
  payload: unknown;
}

export type PersistResult =
  | { outcome: "created"; eventId: string }
  | { outcome: "duplicate" };

/**
 * Persiste o evento de forma idempotente. `shopifyWebhookId` é único no
 * banco — uma segunda entrega do mesmo webhook (a Shopify reenvia em caso
 * de timeout ou erro 5xx) colide na constraint e é tratada como duplicata,
 * nunca reprocessada.
 */
export async function persistWebhookEvent(
  input: PersistWebhookEventInput
): Promise<PersistResult> {
  const store = await prisma.shopifyStore.findUnique({
    where: { shopDomain: input.shopDomain },
    select: { id: true, workspaceId: true },
  });

  try {
    const event = await prisma.shopifyWebhookEvent.create({
      data: {
        shopDomain: input.shopDomain,
        topic: input.topic,
        shopifyWebhookId: input.shopifyWebhookId,
        payload: input.payload as Prisma.InputJsonValue,
        workspaceId: store?.workspaceId,
        shopifyStoreId: store?.id,
      },
      select: { id: true },
    });
    return { outcome: "created", eventId: event.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { outcome: "duplicate" };
    }
    throw error;
  }
}

// Payload REST-style que a Shopify entrega no corpo do webhook (não o GID
// da GraphQL). Usado só para saber QUAL produto mudou — o estado do
// produto em si é sempre buscado de novo na Shopify pelo job, nunca lido
// deste payload.
const productWebhookPayloadSchema = z.object({ id: z.union([z.number(), z.string()]) });

function toProductGid(numericId: number | string): string {
  return `gid://shopify/Product/${numericId}`;
}

/**
 * Despacha o processamento pós-resposta (chamado via `after()` no route
 * handler, fora do caminho crítico da resposta HTTP).
 *
 * `app/uninstalled` continua tratado aqui mesmo (best-effort, idempotente,
 * uma linha) — os tópicos de catálogo (`products/update`,
 * `products/delete`) passam a enfileirar um job na fila persistente em vez
 * de processar inline: uma sincronização pode envolver chamada de rede à
 * Shopify e precisa de retry/crash-recovery, o que `after()` não oferece.
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.shopifyWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "RECEIVED") return;

  if (event.topic === "app/uninstalled") {
    await runEventHandler(event.id, () => handleAppUninstalled(event.shopDomain));
    return;
  }

  if (event.topic === "products/update" || event.topic === "products/delete") {
    await runEventHandler(event.id, () =>
      enqueueProductWebhookJob({
        topic: event.topic,
        workspaceId: event.workspaceId,
        shopifyStoreId: event.shopifyStoreId,
        payload: event.payload,
      })
    );
    return;
  }

  if (event.topic === "orders/create") {
    await runEventHandler(event.id, async () => {
      const outcome = await reconcileOrderCreatedWebhook(event.payload);
      if (outcome === "external") {
        // (B) pedido criado direto na Shopify — evento conhecido, nunca
        // importado como um Order nosso (spec item 22). Segue para
        // PROCESSED (não é uma falha), o outcome já documenta a decisão.
        return;
      }
    });
    return;
  }

  if (event.topic === "orders/updated") {
    await runEventHandler(event.id, async () => {
      await reconcileOrderUpdatedWebhook(event.payload);
    });
    return;
  }

  // Demais tópicos (fulfillments/create): armazenados para processamento
  // em fases futuras.
  await prisma.shopifyWebhookEvent.update({ where: { id: event.id }, data: { status: "IGNORED" } });
}

async function runEventHandler(eventId: string, handler: () => Promise<void>): Promise<void> {
  await prisma.shopifyWebhookEvent.update({ where: { id: eventId }, data: { status: "PROCESSING" } });

  try {
    await handler();
    await prisma.shopifyWebhookEvent.update({
      where: { id: eventId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    await prisma.shopifyWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "erro desconhecido",
      },
    });
  }
}

async function enqueueProductWebhookJob(params: {
  topic: string;
  workspaceId: string | null;
  shopifyStoreId: string | null;
  payload: unknown;
}): Promise<void> {
  if (!params.workspaceId || !params.shopifyStoreId) {
    throw new Error("Webhook recebido para uma loja não resolvida (workspaceId/shopifyStoreId ausentes).");
  }

  const parsedPayload = productWebhookPayloadSchema.parse(params.payload);
  const shopifyProductId = toProductGid(parsedPayload.id);

  if (params.topic === "products/delete") {
    await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      workspaceId: params.workspaceId,
      payload: {
        workspaceId: params.workspaceId,
        shopifyStoreId: params.shopifyStoreId,
        shopifyProductId,
      },
    });
    return;
  }

  await enqueueJob({
    type: "SHOPIFY_PRODUCT_SYNC",
    workspaceId: params.workspaceId,
    payload: {
      workspaceId: params.workspaceId,
      shopifyStoreId: params.shopifyStoreId,
      shopifyProductId,
    },
  });
}

async function handleAppUninstalled(shopDomain: string): Promise<void> {
  const store = await prisma.shopifyStore.findUnique({ where: { shopDomain } });
  if (!store || store.status === "DISCONNECTED") return;

  await prisma.shopifyStore.update({
    where: { id: store.id },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      // Token não tem mais validade (app desinstalado) — não há motivo
      // para mantê-lo armazenado.
      accessTokenEncrypted: null,
    },
  });

  await logAudit({
    workspaceId: store.workspaceId,
    userId: null,
    action: "shopify.store_uninstalled_webhook",
    entityType: "ShopifyStore",
    entityId: store.id,
    metadata: { shopDomain },
  });
}
