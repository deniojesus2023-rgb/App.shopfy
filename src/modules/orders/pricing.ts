import { roundMoney } from "@/modules/shared/money";
import { resolveOfferPrice } from "@/modules/funnels/pricing/resolve-offer-price";
import { resolvePaymentMethodPrice } from "@/modules/funnels/pricing/resolve-payment-method-price";
import type { OfferItem } from "@/modules/funnels/config/steps";
import type { PaymentMethodPricing } from "@/modules/funnels/config/payment-method-pricing";
import { ValidationError } from "@/modules/shared/errors";

/**
 * Único ponto que calcula o preço de um pedido (Fase 4A, estendido na
 * Fase 4C). A matemática de "quanto custa esta oferta" vive em
 * `resolveOfferPrice`, e "quanto o método de pagamento desconta" vive em
 * `resolvePaymentMethodPrice` (ambas compartilhadas com Builder e
 * storefront) — aqui só se decide o que vira `OrderItem`/`Order`.
 *
 * Fluxo (spec Fase 4C item 6): oferta → total da oferta → ajuste de
 * método de pagamento → frete → quote final. O desconto de pagamento
 * incide SEMPRE sobre `offer.total`, nunca sobre `referenceSubtotal` —
 * nunca duplica o desconto da oferta (item 13).
 *
 * `unitPrice` do item resultante é o preço unitário EFETIVO
 * (total final/quantity, arredondado) — informativo para fulfillment/
 * admin, nunca usado para recompor o total (isso é sempre `lineTotal`,
 * exato, sem divisão). Ver modules/orders/handlers/shopify-order-create.ts:
 * o worker Shopify usa sempre `lineTotal` diretamente — como `lineTotal`
 * já reflete o desconto de pagamento, o worker não precisa de NENHUMA
 * mudança para continuar correto (Σ lineTotal === Order.total se mantém).
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
  paymentMethodPricing: PaymentMethodPricing;
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
  /** unitReferencePrice × quantity — "quanto custaria sem oferta nem desconto de pagamento". */
  subtotal: number;
  /** Desconto vindo só da regra da OFERTA (Fase 4A) — nunca inclui o de pagamento. */
  offerDiscount: number;
  /** Desconto vindo só do MÉTODO DE PAGAMENTO (Fase 4C) — nunca inclui o da oferta. */
  paymentMethodDiscount: number;
  /** offerDiscount + paymentMethodDiscount — soma para exibição/armazenamento, nunca recalculado por outro caminho. */
  discountTotal: number;
  shippingTotal: number;
  total: number;
  items: OrderQuoteItem[];
}

export function calculateOrderQuote(input: OrderQuoteInput): OrderQuote {
  const offerResolved = resolveOfferPrice(input.productSnapshot.unitPrice, input.offer);
  const paymentResolved = resolvePaymentMethodPrice(offerResolved.total, input.paymentMethodPricing);

  // Fail closed (spec item 8): nunca um pedido "grátis" ou de total
  // negativo por causa de um FIXED_DISCOUNT configurado maior que o total
  // real da oferta escolhida. Isto não é validável na configuração (ela
  // não sabe qual oferta será escolhida) — só aqui, em runtime, com os
  // dois números resolvidos.
  if (paymentResolved.total <= 0) {
    throw new ValidationError("La configuración de pago para esta oferta no es válida.");
  }

  const finalTotal = paymentResolved.total;
  const effectiveUnitPrice = roundMoney(finalTotal / offerResolved.quantity);
  const combinedDiscount = roundMoney(offerResolved.discount + paymentResolved.discount);

  const item: OrderQuoteItem = {
    titleSnapshot: input.productSnapshot.title,
    productId: input.productSnapshot.productId ?? null,
    productVariantId: input.productSnapshot.productVariantId ?? null,
    shopifyProductId: input.productSnapshot.shopifyProductId ?? null,
    shopifyVariantId: input.productSnapshot.shopifyVariantId ?? null,
    variantTitle: input.productSnapshot.variantTitle ?? null,
    sku: input.productSnapshot.sku ?? null,
    quantity: offerResolved.quantity,
    unitPrice: effectiveUnitPrice,
    lineSubtotal: offerResolved.referenceSubtotal,
    discountTotal: combinedDiscount,
    lineTotal: finalTotal,
  };

  return {
    currency: input.currency,
    subtotal: offerResolved.referenceSubtotal,
    offerDiscount: offerResolved.discount,
    paymentMethodDiscount: paymentResolved.discount,
    discountTotal: combinedDiscount,
    shippingTotal: 0,
    total: finalTotal,
    items: [item],
  };
}
