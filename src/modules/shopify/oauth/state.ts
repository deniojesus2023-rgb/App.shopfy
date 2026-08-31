import "server-only";

import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { ValidationError } from "@/modules/shared/errors";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos — tempo generoso para o usuário autorizar na Shopify

export interface CreateOAuthStateInput {
  workspaceId: string;
  userId: string;
  shopDomain: string;
}

export async function createOAuthState(input: CreateOAuthStateInput): Promise<string> {
  const state = crypto.randomBytes(32).toString("base64url");

  await prisma.shopifyOAuthState.create({
    data: {
      state,
      workspaceId: input.workspaceId,
      userId: input.userId,
      shopDomain: input.shopDomain,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    },
  });

  return state;
}

export interface ConsumedOAuthState {
  workspaceId: string;
  userId: string;
  shopDomain: string;
}

/**
 * Consome o state de forma atômica: `updateMany` com `consumedAt: null` no
 * `where` garante que, mesmo sob concorrência (dois callbacks com o mesmo
 * state chegando ao mesmo tempo — replay deliberado), só a primeira
 * chamada tem sucesso. A segunda encontra `count === 0` e é rejeitada.
 */
export async function consumeOAuthState(
  rawState: string,
  expectedShopDomain: string
): Promise<ConsumedOAuthState> {
  const record = await prisma.shopifyOAuthState.findUnique({ where: { state: rawState } });

  if (!record) {
    throw new ValidationError("State do OAuth inválido.");
  }
  if (record.consumedAt) {
    throw new ValidationError("State do OAuth já foi utilizado.");
  }
  if (record.expiresAt < new Date()) {
    throw new ValidationError("State do OAuth expirado. Tente conectar novamente.");
  }
  if (record.shopDomain !== expectedShopDomain) {
    throw new ValidationError("State do OAuth não corresponde à loja informada.");
  }

  const result = await prisma.shopifyOAuthState.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (result.count === 0) {
    throw new ValidationError("State do OAuth já foi utilizado.");
  }

  return {
    workspaceId: record.workspaceId,
    userId: record.userId,
    shopDomain: record.shopDomain,
  };
}
