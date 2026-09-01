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
      paymentMethodPricing: { type: "NONE" },
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
      paymentMethodPricing: { type: "NONE" },
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
      paymentMethodPricing: { type: "NONE" },
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
      paymentMethodPricing: { type: "NONE" },
      currency: "COP",
    });
    expect(quote.discountTotal).toBe(0);
    expect(quote.total).toBe(100);
  });

  it("fixo maior que a referência gera 'desconto' negativo (sobretaxa permitida)", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "FIXED_TOTAL", amount: 150 } },
      paymentMethodPricing: { type: "NONE" },
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
      paymentMethodPricing: { type: "NONE" },
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
      paymentMethodPricing: { type: "NONE" },
      currency: "COP",
    });
    expect(quote.total).toBe(59.7);
  });

  it("propaga a moeda recebida sem assumir nenhuma específica", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
      paymentMethodPricing: { type: "NONE" },
      currency: "CLP",
    });
    expect(quote.currency).toBe("CLP");
  });
});

describe("calculateOrderQuote — identidade do que foi vendido", () => {
  it("propaga a identidade congelada do snapshot para o item do quote", () => {
    const quote = calculateOrderQuote({
      productSnapshot: {
        unitPrice: 89900,
        title: "Produto X",
        productId: "prod_1",
        productVariantId: "pv_1",
        shopifyProductId: "gid://shopify/Product/1",
        shopifyVariantId: "gid://shopify/ProductVariant/42",
        variantTitle: "Default",
        sku: "SKU-1",
      },
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      paymentMethodPricing: { type: "NONE" },
      currency: "COP",
    });

    expect(quote.items[0]).toMatchObject({
      productVariantId: "pv_1",
      shopifyVariantId: "gid://shopify/ProductVariant/42",
      sku: "SKU-1",
      quantity: 2,
      lineTotal: 149900,
    });
  });

  it("snapshot antigo sem variante congelada gera item com identidade nula, nunca quebra o pedido", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      paymentMethodPricing: { type: "NONE" },
      currency: "COP",
    });

    expect(quote.items[0].shopifyVariantId).toBeNull();
    expect(quote.items[0].quantity).toBe(2);
    expect(quote.items[0].lineTotal).toBe(149900);
  });
});

describe("calculateOrderQuote — PaymentMethodPricing (Fase 4C)", () => {
  it("NONE não altera o total da oferta", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "UNIT_MULTIPLIER" } },
      paymentMethodPricing: { type: "NONE" },
      currency: "COP",
    });
    expect(quote.offerDiscount).toBe(0);
    expect(quote.paymentMethodDiscount).toBe(0);
    expect(quote.total).toBe(179800);
  });

  it("FIXED_DISCOUNT incide sobre o TOTAL DA OFERTA, nunca sobre referenceSubtotal (nunca duplica desconto)", () => {
    // Oferta FIXED_TOTAL: 149.900 (referência 179.800, offerDiscount 29.900).
    // Pagamento: -5.000. Final esperado: 144.900 — nunca 179.800-29.900-5.000
    // calculado errado nem 179.800-5.000 (ignorando a oferta).
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      paymentMethodPricing: { type: "FIXED_DISCOUNT", amount: 5000 },
      currency: "COP",
    });
    expect(quote.subtotal).toBe(179800);
    expect(quote.offerDiscount).toBe(29900);
    expect(quote.paymentMethodDiscount).toBe(5000);
    expect(quote.discountTotal).toBe(34900);
    expect(quote.total).toBe(144900);
    expect(quote.items[0].lineTotal).toBe(144900);
  });

  it("PERCENT_DISCOUNT calcula sobre o total da oferta com roundMoney (nunca float cru)", () => {
    // 149.900 × 5% = 7.495.
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      paymentMethodPricing: { type: "PERCENT_DISCOUNT", percent: 5 },
      currency: "COP",
    });
    expect(quote.paymentMethodDiscount).toBe(7495);
    expect(quote.total).toBe(142405);
  });

  it("moeda zero-decimal (armazenamento continua em 2 casas — Fase 4A) arredonda igual", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(100000),
      offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
      paymentMethodPricing: { type: "PERCENT_DISCOUNT", percent: 33.33 },
      currency: "CLP",
    });
    expect(quote.total).toBe(66670);
  });

  it("desconto igual ao total da oferta: fail closed (total zero nunca cria pedido grátis)", () => {
    expect(() =>
      calculateOrderQuote({
        productSnapshot: productSnapshot(100),
        offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
        paymentMethodPricing: { type: "FIXED_DISCOUNT", amount: 100 },
        currency: "COP",
      })
    ).toThrow();
  });

  it("desconto maior que o total da oferta: fail closed (nunca total negativo)", () => {
    // FIXED_DISCOUNT é validado estruturalmente só quanto a >=0 — "maior
    // que o total" só é detectável em runtime, porque depende de qual
    // oferta foi escolhida (spec item 8).
    expect(() =>
      calculateOrderQuote({
        productSnapshot: productSnapshot(89900),
        offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
        paymentMethodPricing: { type: "FIXED_DISCOUNT", amount: 200000 },
        currency: "COP",
      })
    ).toThrow();
  });

  it("PERCENT_DISCOUNT de 100% também é fail closed (total exatamente zero)", () => {
    expect(() =>
      calculateOrderQuote({
        productSnapshot: productSnapshot(89900),
        offer: { id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
        paymentMethodPricing: { type: "PERCENT_DISCOUNT", percent: 100 },
        currency: "COP",
      })
    ).toThrow();
  });

  it("breakdown completo: subtotal, offerDiscount, paymentMethodDiscount, discountTotal, shippingTotal, total", () => {
    const quote = calculateOrderQuote({
      productSnapshot: productSnapshot(89900),
      offer: { id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
      paymentMethodPricing: { type: "FIXED_DISCOUNT", amount: 5000 },
      currency: "COP",
    });
    expect(quote).toMatchObject({
      subtotal: 179800,
      offerDiscount: 29900,
      paymentMethodDiscount: 5000,
      discountTotal: 34900,
      shippingTotal: 0,
      total: 144900,
    });
  });
});
