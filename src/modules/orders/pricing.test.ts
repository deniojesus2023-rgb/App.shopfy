import { describe, expect, it } from "vitest";

import { calculateOrderQuote } from "./pricing";

describe("calculateOrderQuote", () => {
  it("V1: unitPrice × quantity, sem desconto nem frete", () => {
    const quote = calculateOrderQuote({ unitPrice: 89900, quantity: 2, currency: "COP", titleSnapshot: "Produto X" });

    expect(quote.currency).toBe("COP");
    expect(quote.subtotal).toBe(179800);
    expect(quote.discountTotal).toBe(0);
    expect(quote.shippingTotal).toBe(0);
    expect(quote.total).toBe(179800);
    expect(quote.items).toEqual([
      {
        titleSnapshot: "Produto X",
        quantity: 2,
        unitPrice: 89900,
        lineSubtotal: 179800,
        discountTotal: 0,
        lineTotal: 179800,
      },
    ]);
  });

  it("arredonda em centavos (nunca erro de ponto flutuante)", () => {
    const quote = calculateOrderQuote({ unitPrice: 19.9, quantity: 3, currency: "COP", titleSnapshot: "X" });
    expect(quote.total).toBe(59.7);
  });

  it("quantidade 1 é o caso padrão (sem etapa OFFER)", () => {
    const quote = calculateOrderQuote({ unitPrice: 50, quantity: 1, currency: "COP", titleSnapshot: "X" });
    expect(quote.total).toBe(50);
  });
});
