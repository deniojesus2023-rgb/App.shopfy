import { roundMoney } from "@/modules/shared/money";

/**
 * Único ponto que calcula o preço de um pedido. V1 é deliberadamente
 * simples (unitPrice × quantity, sem desconto, sem frete) — mas toda
 * criação de Order passa por aqui, nunca por `unitPrice * quantity` solto
 * em outro módulo. Isso é o que permite trocar a implementação por uma
 * Pricing Engine de verdade (preço por faixa de quantidade, cupons, frete
 * por região) numa fase futura sem reescrever o Order Engine.
 */
export interface OrderQuoteInput {
  unitPrice: number;
  quantity: number;
  currency: string;
  titleSnapshot: string;
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
  const unitPrice = roundMoney(input.unitPrice);
  const lineSubtotal = roundMoney(unitPrice * input.quantity);
  // V1: sem desconto, sem frete. Ver comentário acima — não implementar
  // preços promocionais/frete aqui ainda, mesmo que pareça trivial.
  const discountTotal = 0;
  const lineTotal = roundMoney(lineSubtotal - discountTotal);

  const item: OrderQuoteItem = {
    titleSnapshot: input.titleSnapshot,
    quantity: input.quantity,
    unitPrice,
    lineSubtotal,
    discountTotal,
    lineTotal,
  };

  return {
    currency: input.currency,
    subtotal: lineSubtotal,
    discountTotal,
    shippingTotal: 0,
    total: lineTotal,
    items: [item],
  };
}
