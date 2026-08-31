import crypto from "node:crypto";

/**
 * Identificador de resolução pública do funil (`/f/[publicId]/[slug]`).
 * Aleatório (não derivado de slug/nome/id sequencial) — mesmo padrão já
 * usado para o `state` do OAuth Shopify. Nunca substitui autorização
 * interna: só serve para o storefront público encontrar o funil sem
 * expor a estrutura de workspace/slug interno.
 */
export function generateFunnelPublicId(): string {
  return crypto.randomBytes(12).toString("base64url");
}
