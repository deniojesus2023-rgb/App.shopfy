import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";

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

/**
 * Despacha o processamento pós-resposta (chamado via `after()` no route
 * handler, fora do caminho crítico da resposta HTTP). Só `app/uninstalled`
 * tem lógica real nesta fase — os demais tópicos ficam armazenados como
 * `IGNORED` para processamento em fases futuras (Catalog, Orders).
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.shopifyWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status !== "RECEIVED") return;

  if (event.topic !== "app/uninstalled") {
    await prisma.shopifyWebhookEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED" },
    });
    return;
  }

  await prisma.shopifyWebhookEvent.update({
    where: { id: event.id },
    data: { status: "PROCESSING" },
  });

  try {
    await handleAppUninstalled(event.shopDomain);
    await prisma.shopifyWebhookEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    await prisma.shopifyWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "erro desconhecido",
      },
    });
  }
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
