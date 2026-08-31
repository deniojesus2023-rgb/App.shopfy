import { describe, expect, it } from "vitest";

import { calculateOrderQuote } from "./pricing";

function productSnapshot(unitPrice: number) {
  return { unitPrice, title: "Produto X" };
}

describe("calculateOrderQuote — UNIT_MULTIPLIER", () => {
  it("total = unitPrice × quantity, sem desconto", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "one", quantity: 2, label: "2x", pricing: { type: "UNIT_MULTIPLIER" } },
      currency: "COP",
    });

    expect(quote.subtotal).toBe(179800);
    expect(quote.discountTotal).toBe(0);
    expect(quote.total).toBe(179800);
    expect(quote.items[0]).toMatchObject({ quantity: 2, unitPrice: 89900, lineTotal: 179800 });
  });

  it("quantidade 1 é o caso padrão (sem etapa OFFER)", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(50),
      offer: { id: "default", quantity: 1, label: "", pricing: { type: "UNIT_MULTIPLIER" } },
      currency: "COP",
    });
    expect(quote.total).toBe(50);
  });
});

describe("calculateOrderQuote — FIXED_TOTAL", () => {
  it("2 × 89.900 → referência 179.800, fixo 149.900 → desconto 29.900", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      currency: "COP",
    });

    expect(quote.subtotal).toBe(179800);
    expect(quote.discountTotal).toBe(29900);
    expect(quote.total).toBe(149900);
    expect(quote.items[0].lineTotal).toBe(149900);
  });

  it("fixo igual à referência não gera desconto", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "FIXED_TOTAL", amount: 100 } },
      currency: "COP",
    });
    expect(quote.discountTotal).toBe(0);
    expect(quote.total).toBe(100);
  });

  it("fixo maior que a referência gera 'desconto' negativo (sobretaxa permitida)", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "FIXED_TOTAL", amount: 150 } },
      currency: "COP",
    });
    expect(quote.discountTotal).toBe(-50);
    expect(quote.total).toBe(150);
  });

  it("preserva a fidelidade do total mesmo quando não divide em centavos exatos por quantity", () => {
    // 149.900 / 3 = 49.966,666... — o unitPrice do item é só informativo
    // (arredondado); lineTotal é sempre exato, e é ele que soma para o total.
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "three", quantity: 3, label: "3x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      currency: "COP",
    });

    expect(quote.items[0].lineTotal).toBe(149900);
    expect(quote.total).toBe(149900);
    expect(quote.items.reduce((sum, i) => sum + i.lineTotal, 0)).toBe(quote.total);
  });
});

describe("calculateOrderQuote — money/currency", () => {
  it("arredonda em centavos (nunca erro de ponto flutuante)", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(19.9),
      offer: { id: "three", quantity: 3, label: "3x", pricing: { type: "UNIT_MULTIPLIER" } },
      currency: "COP",
    });
    expect(quote.total).toBe(59.7);
  });

  it("propaga a moeda recebida sem assumir nenhuma específica", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
      currency: "CLP",
    });
    expect(quote.currency).toBe("CLP");
  });
});
