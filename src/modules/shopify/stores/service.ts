import "server-only";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import type { TenantContext } from "@/modules/workspaces/tenant";
import { decryptToken, encryptToken } from "../encryption";

export async function listStoresForWorkspace(workspaceId: string) {
  return prisma.shopifyStore.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
}

interface ConnectStoreInput {
  workspaceId: string;
  shopDomain: string;
  accessToken: string;
  scope: string;
  displayName?: string | null;
  /** ISO 4217 de `shop.currencyCode` — fallback "COP" quando ausente (ver schema Prisma). */
  currency?: string | null;
}

/**
 * Cria ou reconecta uma `ShopifyStore`. `shopDomain` é único no banco (uma
 * linha por loja, para sempre) — reconectar a mesma loja no mesmo workspace
 * atualiza a linha existente; tentar conectar uma loja que já está
 * CONNECTED em outro workspace é rejeitado. Uma loja DISCONNECTED em outro
 * workspace pode ser realocada (o merchant decidiu mover a integração).
 */
export async function connectStore(input: ConnectStoreInput) {
  const existing = await prisma.shopifyStore.findUnique({
    where: { shopDomain: input.shopDomain },
  });

  if (existing && existing.workspaceId !== input.workspaceId && existing.status === "CONNECTED") {
    throw new ValidationError(
      "Esta loja Shopify já está conectada a outro workspace nesta plataforma."
    );
  }

  const accessTokenEncrypted = encryptToken(input.accessToken);
  const currency = input.currency ?? "COP";

  const store = await prisma.shopifyStore.upsert({
    where: { shopDomain: input.shopDomain },
    create: {
      workspaceId: input.workspaceId,
      shopDomain: input.shopDomain,
      displayName: input.displayName,
      accessTokenEncrypted,
      scopes: input.scope,
      status: "CONNECTED",
      currency,
    },
    update: {
      workspaceId: input.workspaceId,
      displayName: input.displayName,
      accessTokenEncrypted,
      scopes: input.scope,
      status: "CONNECTED",
      disconnectedAt: null,
      installedAt: new Date(),
      currency,
    },
  });

  return store;
}

interface DisconnectStoreInput {
  ctx: TenantContext;
  storeId: string;
}

/** Chamado após o caller já ter validado `shopify:manage_stores` via `ctx`. */
export async function disconnectStore({ ctx, storeId }: DisconnectStoreInput) {
  const store = await prisma.shopifyStore.findFirst({
    where: { id: storeId, workspaceId: ctx.workspace.id },
  });
  if (!store) {
    throw new NotFoundError("Loja não encontrada.");
  }

  const updated = await prisma.shopifyStore.update({
    where: { id: store.id },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      // Desconexão explícita pelo usuário: não há motivo para manter um
      // token utilizável armazenado depois que ele pediu para desconectar.
      accessTokenEncrypted: null,
    },
  });

  await logAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "shopify.store_disconnected",
    entityType: "ShopifyStore",
    entityId: store.id,
    metadata: { shopDomain: store.shopDomain },
  });

  return updated;
}

/**
 * Único ponto do sistema que devolve um access token em claro — e mesmo
 * assim apenas em memória do processo servidor, nunca serializado para o
 * client. Módulos futuros (Catalog, Orders) devem chamar isto, nunca ler
 * `accessTokenEncrypted` diretamente.
 */
export async function getDecryptedAccessToken(
  workspaceId: string,
  storeId: string
): Promise<string> {
  const store = await prisma.shopifyStore.findFirst({
    where: { id: storeId, workspaceId },
  });

  if (!store) {
    throw new NotFoundError("Loja não encontrada.");
  }
  if (store.status !== "CONNECTED" || !store.accessTokenEncrypted) {
    throw new ForbiddenError("Loja não está conectada.");
  }

  return decryptToken(store.accessTokenEncrypted);
}
