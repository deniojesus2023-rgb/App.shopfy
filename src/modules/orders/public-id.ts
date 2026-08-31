import crypto from "node:crypto";

/**
 * Identificador de resolução pública do pedido — aleatório, não derivado
 * de `orderNumber`/id interno (mesmo padrão de `generateFunnelPublicId`).
 * `orderNumber` é sequencial e amigável, mas nunca deve ser usado como
 * chave de busca num endpoint público (permitiria enumerar pedidos).
 */
export function generateOrderPublicId(): string {
  return crypto.randomBytes(12).toString("base64url");
}
