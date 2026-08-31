/**
 * Identidade externa de um pedido nosso dentro da Shopify.
 *
 * `sourceIdentifier` é o campo documentado do `OrderCreateOrderInput` para
 * "o ID do pedido no sistema de origem", e é filtrável na query `orders`
 * via `source_identifier:<valor>`. É ELE, e só ele, que serve de
 * identidade para reconciliação — a tag `internal_order_<id>`
 * (modules/orders/shopify-tag.ts) continua existindo como apoio
 * visual/operacional para o lojista, mas é editável pela UI da Shopify e
 * por qualquer outro app instalado, então nunca pode ser a base de uma
 * decisão de "este pedido já existe, não criar de novo".
 *
 * O valor é namespaced para nunca colidir com o identificador de origem de
 * outra integração instalada na mesma loja, e carrega só o `Order.id`
 * (cuid opaco) — nenhum dado pessoal, nada derivado do cliente.
 */
const PREFIX = "appshopfy_order_";

export function orderSourceIdentifier(orderId: string): string {
  return `${PREFIX}${orderId}`;
}

export function parseOrderSourceIdentifier(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const orderId = value.slice(PREFIX.length);
  return orderId.length > 0 ? orderId : null;
}
