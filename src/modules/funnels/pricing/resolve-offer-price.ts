import { roundMoney } from "@/modules/shared/money";
import type { PricingRule } from "../config/pricing-rule";

/**
 * Núcleo puro de precificação de uma oferta — sem I/O, sem acesso a banco.
 * Compartilhado por três consumidores que NUNCA devem divergir entre si:
 * preview do Builder (economia mostrada ao lojista), exibição no
 * storefront (PRODUCT/OFFER steps), e `calculateOrderQuote` no servidor.
 * O servidor continua sendo a única autoridade sobre o que é COBRADO —
 * isto aqui só existe para o client e o servidor calcularem a MESMA coisa
 * a partir do mesmo dado (snapshot + config publicado), nunca para o
 * client informar um preço que o servidor apenas confia.
 */
export interface ResolvedOfferPrice {
  quantity: number;
  /** Preço unitário de referência (sempre productSnapshot.unitPrice — nunca o "efetivo" de um FIXED_TOTAL). */
  unitReferencePrice: number;
  /** unitReferencePrice × quantity — "quanto custaria sem a oferta". */
  referenceSubtotal: number;
  /** Valor realmente cobrado por esta oferta. */
  total: number;
  /**
   * referenceSubtotal - total. Positivo = desconto de verdade. Negativo =
   * sobretaxa (FIXED_TOTAL acima da referência — permitido, ver spec item
   * 13: frete embutido, bundle especial etc.). Zero = preço igual à
   * referência.
   */
  discount: number;
  pricingType: PricingRule["type"];
}

export interface OfferPricingInput {
  quantity: number;
  pricing: PricingRule;
}

export function resolveOfferPrice(unitReferencePrice: number, offer: OfferPricingInput): ResolvedOfferPrice {
  const unit = roundMoney(unitReferencePrice);
  const referenceSubtotal = roundMoney(unit * offer.quantity);
  const total = offer.pricing.type === "FIXED_TOTAL" ? roundMoney(offer.pricing.amount) : referenceSubtotal;
  const discount = roundMoney(referenceSubtotal - total);

  return {
    quantity: offer.quantity,
    unitReferencePrice: unit,
    referenceSubtotal,
    total,
    discount,
    pricingType: offer.pricing.type,
  };
}

/** Percentual de economia (0–100), só definido quando há desconto real (discount > 0). */
export function savingsPercent(resolved: ResolvedOfferPrice): number | null {
  if (resolved.discount <= 0 || resolved.referenceSubtotal <= 0) return null;
  return roundMoney((resolved.discount / resolved.referenceSubtotal) * 100);
}
