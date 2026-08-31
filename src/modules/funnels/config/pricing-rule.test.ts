import { describe, expect, it } from "vitest";

import { pricingRuleSchema } from "./pricing-rule";

describe("pricingRuleSchema", () => {
  it("aceita UNIT_MULTIPLIER sem campos adicionais", () => {
    expect(pricingRuleSchema.safeParse({ type: "UNIT_MULTIPLIER" }).success).toBe(true);
  });

  it("aceita FIXED_TOTAL com amount positivo válido", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: 149900 }).success).toBe(true);
  });

  it("rejeita FIXED_TOTAL sem amount", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL" }).success).toBe(false);
  });

  it("rejeita amount zero ou negativo (nunca valor monetário negativo)", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: 0 }).success).toBe(false);
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: -100 }).success).toBe(false);
  });

  it("rejeita NaN e Infinity", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: NaN }).success).toBe(false);
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: Infinity }).success).toBe(false);
  });

  it("rejeita float impreciso (mais de 2 casas decimais)", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: 100.999 }).success).toBe(false);
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: 0.1 + 0.2 }).success).toBe(false);
  });

  it("rejeita valores acima do teto razoável", () => {
    expect(pricingRuleSchema.safeParse({ type: "FIXED_TOTAL", amount: 1_000_000_000 }).success).toBe(false);
  });

  it("rejeita tipo de pricing desconhecido", () => {
    expect(pricingRuleSchema.safeParse({ type: "BUY_X_GET_Y" }).success).toBe(false);
  });
});
