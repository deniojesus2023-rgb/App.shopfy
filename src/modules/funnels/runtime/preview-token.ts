import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";

const PREVIEW_TTL_MS = 15 * 60 * 1000; // 15 minutos

interface PreviewTokenPayload {
  funnelId: string;
  versionId: string;
  exp: number; // epoch ms
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.FUNNEL_PREVIEW_SECRET).update(payload, "utf8").digest("base64url");
}

/**
 * Token de preview de rascunho: assinado (HMAC), curto (15 min), sem
 * persistência em banco — não precisa de revogação individual no MVP. É a
 * única forma de acessar uma FunnelVersion não publicada publicamente; o ID
 * do funil sozinho nunca é suficiente (ver runtime/resolve.ts).
 */
export function createPreviewToken(funnelId: string, versionId: string): string {
  const payload: PreviewTokenPayload = { funnelId, versionId, exp: Date.now() + PREVIEW_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyPreviewToken(token: string): PreviewTokenPayload | null {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSignature = sign(payloadB64);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  if (typeof payload.funnelId !== "string" || typeof payload.versionId !== "string") return null;

  return payload;
}
