/**
 * Tag de apoio operacional/visual no pedido Shopify — deixa o lojista
 * enxergar na UI da Shopify que aquele pedido nasceu de um funil nosso.
 *
 * NÃO é identidade: tag é campo mutável (a UI da Shopify e qualquer outro
 * app instalado podem editar ou remover) e a busca por tag é textual.
 * Toda decisão de reconciliação ("este pedido já existe, não criar outro")
 * usa `sourceIdentifier` — ver modules/orders/shopify-identity.ts.
 *
 * Sem `:` de propósito: a sintaxe de busca da Shopify usa `:` como
 * delimitador de operador (`tag:valor`).
 */
const PREFIX = "internal_order_";

export function internalOrderTag(orderId: string): string {
  return `${PREFIX}${orderId}`;
}

/**
 * Só usado como FALLBACK na reconciliação de webhook, para pedidos criados
 * antes de `sourceIdentifier` passar a ser enviado — nunca como fonte
 * primária de identidade.
 */
export function parseInternalOrderTag(tags: string[]): string | null {
  const tag = tags.find((t) => t.startsWith(PREFIX));
  return tag ? tag.slice(PREFIX.length) : null;
}
