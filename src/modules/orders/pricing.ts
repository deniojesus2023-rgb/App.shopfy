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
/**
 * Identidade do que está sendo vendido, congelada na versão publicada.
 * Tudo opcional porque versões publicadas antes de a variante ser
 * congelada continuam gerando pedidos normalmente — o pedido só fica sem
 * a identidade de variante, nunca sem quantidade ou preço.
 */
export interface QuoteProductIdentity {
  productId?: string | null;
  productVariantId?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
}

export interface OrderQuoteInput {
  productSnapshot: { unitPrice: number; title: string } & QuoteProductIdentity;
  offer: OfferItem;
  currency: string;
}

export interface OrderQuoteItem extends QuoteProductIdentity {
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
    productId: input.productSnapshot.productId ?? null,
    productVariantId: input.productSnapshot.productVariantId ?? null,
    shopifyProductId: input.productSnapshot.shopifyProductId ?? null,
    shopifyVariantId: input.productSnapshot.shopifyVariantId ?? null,
    variantTitle: input.productSnapshot.variantTitle ?? null,
    sku: input.productSnapshot.sku ?? null,
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
