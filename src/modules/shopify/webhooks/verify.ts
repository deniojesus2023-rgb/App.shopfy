import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";

/**
 * Verifica a assinatura HMAC-SHA256 de um webhook Shopify. Deve receber o
 * corpo *raw* da request (antes de qualquer JSON.parse) — a assinatura é
 * calculada sobre os bytes exatos que a Shopify enviou.
 */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);

  if (digestBuffer.length !== headerBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, headerBuffer);
}

/**
 * Verifica a assinatura HMAC dos query params do redirect do OAuth
 * (documentado pela Shopify como "verifying requests"). Diferente do
 * webhook: aqui a assinatura é sobre os pares chave=valor ordenados
 * alfabeticamente, concatenados com "&", excluindo `hmac` e `signature`.
 */
export function verifyOAuthCallbackHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const digest = crypto
    .createHmac("sha256", env.SHOPIFY_API_SECRET)
    .update(message, "utf8")
    .digest("hex");

  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(hmac);

  if (digestBuffer.length !== hmacBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, hmacBuffer);
}
