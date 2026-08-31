import { roundMoney } from "@/modules/shared/money";
import { resolveOfferPrice } from "@/modules/funnels/pricing/resolve-offer-price";
import type { OfferItem } from "@/modules/funnels/config/steps";

/**
 * Único ponto que calcula o preço de um pedido (Fase 4A). A matemática de
 * "quanto custa esta oferta" vive em `resolveOfferPrice` (compartilhada
 * com Builder e storefront) — aqui só se decide o que vira `OrderItem`.
 *
 * `unitPrice` do item resultante é o preço unitário EFETIVO (total/quantity,
 * arredondado) — informativo para fulfillment/admin, nunca usado para
 * recompor o total (isso é sempre `lineTotal`, exato, sem divisão). Ver
 * modules/orders/handlers/shopify-order-create.ts: o worker Shopify usa
 * sempre `lineTotal` diretamente, nunca `unitPrice × quantity`, exatamente
 * para não reintroduzir o problema de arredondamento que um FIXED_TOTAL
 * não divisível por quantity causaria.
 */
export interface OrderQuoteInput {
  productSnapshot: { unitPrice: number; title: string };
  offer: OfferItem;
  currency: string;
}

export interface OrderQuoteItem {
  titleSnapshot: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  discountTotal: number;
  lineTotal: number;
}

export interface OrderQuote {
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  items: OrderQuoteItem[];
}

export function calculateOrderQuote(input: OrderQuoteInput): OrderQuote {
  const resolved = resolveOfferPrice(input.productSnapshot.unitPrice, input.offer);
  const effectiveUnitPrice = roundMoney(resolved.total / resolved.quantity);

  const item: OrderQuoteItem = {
    titleSnapshot: input.productSnapshot.title,
    quantity: resolved.quantity,
    unitPrice: effectiveUnitPrice,
    lineSubtotal: resolved.referenceSubtotal,
    discountTotal: resolved.discount,
    lineTotal: resolved.total,
  };

  return {
    currency: input.currency,
    subtotal: resolved.referenceSubtotal,
    discountTotal: resolved.discount,
    shippingTotal: 0,
    total: resolved.total,
    items: [item],
  };
}
