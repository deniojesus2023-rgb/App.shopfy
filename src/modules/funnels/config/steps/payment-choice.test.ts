import { describe, expect, it } from "vitest";

import { paymentChoiceStepConfigSchema } from "./payment-choice";

function codMethod(overrides: Record<string, unknown> = {}) {
  return { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "COD", pricing: { type: "NONE" }, ...overrides };
}

function onlineMethod(overrides: Record<string, unknown> = {}) {
  return { id: "online", method: "ONLINE", provider: "SHOPIFY_CHECKOUT", enabled: true, label: "Online", pricing: { type: "NONE" }, ...overrides };
}

describe("paymentChoiceStepConfigSchema — estrutura", () => {
  it("aceita um único método COD/INTERNAL_COD", () => {
    expect(paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod()] }).success).toBe(true);
  });

  it("aceita COD + ONLINE juntos", () => {
    expect(paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod(), onlineMethod()] }).success).toBe(true);
  });

  it("rejeita paymentMethods vazio", () => {
    expect(paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [] }).success).toBe(false);
  });

  it("rejeita IDs duplicados", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod(), codMethod({ label: "COD 2" })] }).success
    ).toBe(false);
  });

  it("rejeita quando nenhum método está habilitado", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod({ enabled: false }), onlineMethod({ enabled: false })] })
        .success
    ).toBe(false);
  });

  it("aceita quando ao menos um método está habilitado", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod({ enabled: false }), onlineMethod({ enabled: true })] })
        .success
    ).toBe(true);
  });
});

describe("paymentChoiceStepConfigSchema — method/provider (spec item 4)", () => {
  it("rejeita COD com provider diferente de INTERNAL_COD", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod({ provider: "SHOPIFY_CHECKOUT" })] }).success
    ).toBe(false);
  });

  it("rejeita ONLINE com provider INTERNAL_COD", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [onlineMethod({ provider: "INTERNAL_COD" })] }).success
    ).toBe(false);
  });

  it("aceita ONLINE com SHOPIFY_CHECKOUT ou YAMPI", () => {
    expect(paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [onlineMethod({ provider: "YAMPI" })] }).success).toBe(true);
  });
});

describe("paymentChoiceStepConfigSchema — recommendedMethodId", () => {
  it("aceita recommendedMethodId referenciando um método existente", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod()], recommendedMethodId: "cod" }).success
    ).toBe(true);
  });

  it("rejeita recommendedMethodId inexistente", () => {
    expect(
      paymentChoiceStepConfigSchema.safeParse({ paymentMethods: [codMethod()], recommendedMethodId: "inexistente" }).success
    ).toBe(false);
  });
});
