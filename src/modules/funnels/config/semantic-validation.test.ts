import { describe, expect, it } from "vitest";

import type { FunnelConfig } from "./schema";
import { validateFunnelSemantics, type FunnelProductRef } from "./semantic-validation";

const theme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM" as const,
  fontFamily: "SYSTEM" as const,
  buttonStyle: "SOLID" as const,
};

function productStep(overrides: Partial<{ id: string; order: number; enabled: boolean }> = {}) {
  return {
    id: overrides.id ?? "product",
    type: "PRODUCT" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 0,
    config: {
      showRating: false,
      showBenefits: false,
      benefits: [],
      showCompareAtPrice: false,
      ctaText: "Comprar",
    },
  };
}

function successStep(overrides: Partial<{ id: string; order: number; enabled: boolean }> = {}) {
  return {
    id: overrides.id ?? "success",
    type: "SUCCESS" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 1,
    config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
  };
}

function paymentChoiceStep(
  overrides: Partial<{ id: string; order: number; enabled: boolean; allowCod: boolean }> = {}
) {
  return {
    id: overrides.id ?? "payment",
    type: "PAYMENT_CHOICE" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 2,
    config: {
      allowCod: overrides.allowCod ?? true,
      allowOnlinePayment: true,
      codLabel: "COD",
      onlinePaymentLabel: "Online",
    },
  };
}

function codFormStep(overrides: Partial<{ id: string; order: number; enabled: boolean }> = {}) {
  return {
    id: overrides.id ?? "cod-form",
    type: "COD_FORM" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 3,
    config: { fields: [], submitButtonText: "Enviar" },
  };
}

function upsellStep(overrides: Partial<{ id: string; order: number; enabled: boolean }> = {}) {
  return {
    id: overrides.id ?? "upsell",
    type: "UPSELL" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 4,
    config: { headline: "Leve mais", productRole: "UPSELL" as const, ctaText: "Sim", declineText: "Não" },
  };
}

function config(steps: FunnelConfig["steps"]): FunnelConfig {
  return { schemaVersion: 2, theme, steps, settings: {} };
}

const baseContext = { workspaceId: "ws_1", shopifyStoreId: "store_1" };

function primaryProductRef(): FunnelProductRef {
  return { productId: "prod_1", role: "PRIMARY", product: { workspaceId: "ws_1", shopifyStoreId: "store_1" } };
}

describe("validateFunnelSemantics", () => {
  it("config mínimo válido (PRODUCT + SUCCESS) não gera erros", () => {
    const errors = validateFunnelSemantics(config([productStep(), successStep()]), {
      ...baseContext,
      funnelProducts: [primaryProductRef()],
    });
    expect(errors).toEqual([]);
  });

  it("exige exatamente uma etapa PRODUCT habilitada", () => {
    const errors = validateFunnelSemantics(config([successStep()]), {
      ...baseContext,
      funnelProducts: [primaryProductRef()],
    });
    expect(errors.some((e) => e.message.includes("PRODUCT"))).toBe(true);
  });

  it("PRODUCT desabilitado não conta como presente", () => {
    const errors = validateFunnelSemantics(
      config([productStep({ enabled: false }), successStep()]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("PRODUCT"))).toBe(true);
  });

  it("exige exatamente uma etapa SUCCESS habilitada", () => {
    const errors = validateFunnelSemantics(config([productStep()]), {
      ...baseContext,
      funnelProducts: [primaryProductRef()],
    });
    expect(errors.some((e) => e.message.includes("SUCCESS"))).toBe(true);
  });

  it("rejeita IDs de step duplicados", () => {
    const errors = validateFunnelSemantics(
      config([productStep({ id: "dup" }), successStep({ id: "dup", order: 1 })]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("duplicados"))).toBe(true);
  });

  it("rejeita valores de order duplicados", () => {
    const errors = validateFunnelSemantics(
      config([productStep({ order: 0 }), successStep({ order: 0 })]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("order"))).toBe(true);
  });

  it("COD_FORM exige PAYMENT_CHOICE habilitado com allowCod=true", () => {
    const errors = validateFunnelSemantics(
      config([productStep(), successStep(), codFormStep({ order: 2 })]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("COD_FORM"))).toBe(true);
  });

  it("COD_FORM passa quando há PAYMENT_CHOICE com allowCod=true", () => {
    const errors = validateFunnelSemantics(
      config([productStep(), successStep(), paymentChoiceStep({ order: 2 }), codFormStep({ order: 3 })]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors).toEqual([]);
  });

  it("COD_FORM falha se PAYMENT_CHOICE existe mas allowCod=false", () => {
    const errors = validateFunnelSemantics(
      config([
        productStep(),
        successStep(),
        paymentChoiceStep({ order: 2, allowCod: false }),
        codFormStep({ order: 3 }),
      ]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("COD_FORM"))).toBe(true);
  });

  it("UPSELL exige FunnelProduct com role UPSELL", () => {
    const errors = validateFunnelSemantics(
      config([productStep(), successStep(), upsellStep({ order: 2 })]),
      { ...baseContext, funnelProducts: [primaryProductRef()] }
    );
    expect(errors.some((e) => e.message.includes("UPSELL"))).toBe(true);
  });

  it("UPSELL passa quando existe FunnelProduct role UPSELL", () => {
    const errors = validateFunnelSemantics(
      config([productStep(), successStep(), upsellStep({ order: 2 })]),
      {
        ...baseContext,
        funnelProducts: [
          primaryProductRef(),
          { productId: "prod_2", role: "UPSELL", product: { workspaceId: "ws_1", shopifyStoreId: "store_1" } },
        ],
      }
    );
    expect(errors).toEqual([]);
  });

  it("rejeita produto de outro workspace", () => {
    const errors = validateFunnelSemantics(config([productStep(), successStep()]), {
      ...baseContext,
      funnelProducts: [
        { productId: "prod_x", role: "PRIMARY", product: { workspaceId: "outro_ws", shopifyStoreId: "store_1" } },
      ],
    });
    expect(errors.some((e) => e.message.includes("outro workspace"))).toBe(true);
  });

  it("rejeita produto de outra loja Shopify (mesmo workspace)", () => {
    const errors = validateFunnelSemantics(config([productStep(), successStep()]), {
      ...baseContext,
      funnelProducts: [
        { productId: "prod_x", role: "PRIMARY", product: { workspaceId: "ws_1", shopifyStoreId: "outra_loja" } },
      ],
    });
    expect(errors.some((e) => e.message.includes("loja diferente"))).toBe(true);
  });
});
