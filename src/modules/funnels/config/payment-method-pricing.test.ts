import { describe, expect, it } from "vitest";

import { paymentMethodPricingSchema } from "./payment-method-pricing";

describe("paymentMethodPricingSchema — NONE", () => {
  it("aceita NONE sem campos adicionais", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "NONE" }).success).toBe(true);
  });
});

describe("paymentMethodPricingSchema — FIXED_DISCOUNT", () => {
  it("aceita amount positivo válido", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: 5000 }).success).toBe(true);
  });

  it("aceita amount ZERO (diferente de FIXED_TOTAL da oferta — spec item 8 permite 0 <= discount)", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: 0 }).success).toBe(true);
  });

  it("rejeita amount negativo", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: -1 }).success).toBe(false);
  });

  it("rejeita sem amount", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT" }).success).toBe(false);
  });

  it("rejeita NaN e Infinity", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: NaN }).success).toBe(false);
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: Infinity }).success).toBe(false);
  });

  it("rejeita float impreciso (mais de 2 casas decimais)", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: 100.999 }).success).toBe(false);
  });

  it("rejeita valores acima do teto razoável", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "FIXED_DISCOUNT", amount: 1_000_000_000 }).success).toBe(false);
  });
});

describe("paymentMethodPricingSchema — PERCENT_DISCOUNT", () => {
  it("aceita percent entre 0 (exclusivo) e 100 (inclusivo)", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: 0.01 }).success).toBe(true);
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: 100 }).success).toBe(true);
  });

  it("rejeita percent ZERO (sem desconto já tem representação própria: NONE)", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: 0 }).success).toBe(false);
  });

  it("rejeita percent negativo", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: -5 }).success).toBe(false);
  });

  it("rejeita percent acima de 100", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: 100.01 }).success).toBe(false);
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: 250 }).success).toBe(false);
  });

  it("rejeita NaN e Infinity", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: NaN }).success).toBe(false);
    expect(paymentMethodPricingSchema.safeParse({ type: "PERCENT_DISCOUNT", percent: Infinity }).success).toBe(false);
  });
});

describe("paymentMethodPricingSchema — tipo desconhecido", () => {
  it("rejeita tipo de pricing desconhecido", () => {
    expect(paymentMethodPricingSchema.safeParse({ type: "BUY_X_GET_Y" }).success).toBe(false);
  });
});
