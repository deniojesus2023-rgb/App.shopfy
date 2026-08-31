// Tag usada para amarrar um pedido Shopify ao nosso Order.id (reconciliação
// — ver modules/shopify/orders.ts e modules/orders/handlers/shopify-order-create.ts).
// Sem `:` de propósito: a sintaxe de busca da Shopify usa `:` como
// delimitador de operador (`tag:valor`), então um valor com `:` dentro
// quebraria a busca por tag.
const PREFIX = "internal_order_";

export function internalOrderTag(orderId: string): string {
  return `${PREFIX}${orderId}`;
}

export function parseInternalOrderTag(tags: string[]): string | null {
  const tag = tags.find((t) => t.startsWith(PREFIX));
  return tag ? tag.slice(PREFIX.length) : null;
}
