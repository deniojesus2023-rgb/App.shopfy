import { roundMoney } from "@/modules/shared/money";
import type { PaymentMethodPricing } from "../config/payment-method-pricing";

/**
 * Núcleo puro de precificação de MÉTODO DE PAGAMENTO — sem I/O, aplicado
 * DEPOIS do preço da oferta (Fase 4A), sobre `offerTotal`, nunca sobre a
 * referência do produto (spec Fase 4C item 13: nunca duplicar desconto).
 * Mesmo espírito de resolve-offer-price.ts: compartilhado por Builder
 * (preview), Storefront (exibição) e `calculateOrderQuote` (servidor, a
 * única autoridade sobre o que é COBRADO).
 *
 * NÃO valida "desconto não pode superar o total" aqui — só calcula. Essa
 * invariante comercial (spec item 8: finalTotal > 0, nunca pedido grátis)
 * é responsabilidade do CALLER (`calculateOrderQuote`), que decide fail
 * closed em vez de clamp silencioso. Uma função de math pura não deve
 * mascarar um config incoerente virando um número "razoável" sozinha.
 */
export interface ResolvedPaymentMethodPrice {
  /** Total da oferta ANTES do ajuste de método de pagamento — nunca a referência pré-oferta. */
  baseTotal: number;
  /** Desconto aplicado pelo método de pagamento. Sempre >= 0 — este core não conhece sobretaxa por pagamento. */
  discount: number;
  /** baseTotal - discount. Pode ser <= 0 se a config for incoerente — o caller decide o que fazer com isso. */
  total: number;
}

export function resolvePaymentMethodPrice(offerTotal: number, pricing: PaymentMethodPricing): ResolvedPaymentMethodPrice {
  const baseTotal = roundMoney(offerTotal);

  const discount = (() => {
    switch (pricing.type) {
      case "NONE":
        return 0;
      case "FIXED_DISCOUNT":
        return roundMoney(pricing.amount);
      case "PERCENT_DISCOUNT":
        return roundMoney(baseTotal * (pricing.percent / 100));
    }
  })();

  return { baseTotal, discount, total: roundMoney(baseTotal - discount) };
}
