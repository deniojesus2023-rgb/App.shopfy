import { describe, expect, it } from "vitest";

import { resolveOfferPrice, savingsPercent } from "./resolve-offer-price";

describe("resolveOfferPrice — UNIT_MULTIPLIER", () => {
  it("total = unitPrice × quantity, sem desconto", () => {
    const resolved = resolveOfferPrice(89900, { quantity: 2, pricing: { type: "UNIT_MULTIPLIER" } });
    expect(resolved.referenceSubtotal).toBe(179800);
    expect(resolved.total).toBe(179800);
    expect(resolved.discount).toBe(0);
    expect(resolved.pricingType).toBe("UNIT_MULTIPLIER");
  });
});

describe("resolveOfferPrice — FIXED_TOTAL", () => {
  it("2 × 89.900 → referência 179.800, fixo 149.900 → desconto 29.900", () => {
    const resolved = resolveOfferPrice(89900, {
      quantity: 2,
      pricing: { type: "FIXED_TOTAL", amount: 149900 },
    });
    expect(resolved.referenceSubtotal).toBe(179800);
    expect(resolved.total).toBe(149900);
    expect(resolved.discount).toBe(29900);
  });

  it("fixo igual à referência: desconto zero", () => {
    const resolved = resolveOfferPrice(100, { quantity: 1, pricing: { type: "FIXED_TOTAL", amount: 100 } });
    expect(resolved.discount).toBe(0);
  });

  it("fixo maior que a referência: desconto negativo (sobretaxa permitida, spec item 13)", () => {
    const resolved = resolveOfferPrice(100, { quantity: 1, pricing: { type: "FIXED_TOTAL", amount: 150 } });
    expect(resolved.discount).toBe(-50);
    expect(resolved.total).toBe(150);
  });
});

describe("savingsPercent", () => {
  it("calcula o percentual só quando há desconto real (> 0)", () => {
    const resolved = resolveOfferPrice(89900, {
      quantity: 2,
      pricing: { type: "FIXED_TOTAL", amount: 149900 },
    });
    expect(savingsPercent(resolved)).toBeCloseTo(16.63, 1);
  });

  it("retorna null quando não há desconto (zero ou sobretaxa)", () => {
    const noDiscount = resolveOfferPrice(100, { quantity: 1, pricing: { type: "UNIT_MULTIPLIER" } });
    expect(savingsPercent(noDiscount)).toBeNull();

    const surcharge = resolveOfferPrice(100, { quantity: 1, pricing: { type: "FIXED_TOTAL", amount: 150 } });
    expect(savingsPercent(surcharge)).toBeNull();
  });
});
