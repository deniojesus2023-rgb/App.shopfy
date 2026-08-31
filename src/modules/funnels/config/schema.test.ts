import { describe, expect, it } from "vitest";

import { funnelConfigV1Schema } from "./schema";
import { parseFunnelConfig } from "./parse";
import { PROGRESS_REWARD_COD_TEMPLATE } from "./seed-templates";

const validTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

function baseConfig(steps: unknown[]) {
  return { schemaVersion: 1, theme: validTheme, steps, settings: {} };
}

describe("funnelConfigV1Schema — estrutura geral", () => {
  it("aceita o template seed válido", () => {
    expect(funnelConfigV1Schema.safeParse(PROGRESS_REWARD_COD_TEMPLATE.defaultConfig).success).toBe(true);
  });

  it("rejeita schemaVersion diferente de 1", () => {
    const config = { ...baseConfig([]), schemaVersion: 2 };
    expect(funnelConfigV1Schema.safeParse(config).success).toBe(false);
  });

  it("rejeita cor fora do padrão hexadecimal (proteção contra CSS arbitrário)", () => {
    const config = baseConfig([]);
    config.theme = { ...validTheme, primaryColor: "red; background: url(javascript:alert(1))" };
    expect(funnelConfigV1Schema.safeParse(config).success).toBe(false);
  });

  it("rejeita steps vazio (min 1) e mais de 20 (max 20)", () => {
    expect(funnelConfigV1Schema.safeParse(baseConfig([])).success).toBe(false);

    const tooMany = Array.from({ length: 21 }, (_, i) => successStep(`s${i}`, i));
    expect(funnelConfigV1Schema.safeParse(baseConfig(tooMany)).success).toBe(false);
  });

  it("settings não aceita chave arbitrária (schema fechado)", () => {
    const config = { ...baseConfig([successStep("s", 0)]), settings: { arbitrary: "x" } };
    expect(funnelConfigV1Schema.safeParse(config).success).toBe(false);
  });
});

function successStep(id: string, order: number) {
  return {
    id,
    type: "SUCCESS",
    enabled: true,
    order,
    config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
  };
}

describe("discriminated union de steps", () => {
  it("PRODUCT: showRating exige ratingValue", () => {
    const step = {
      id: "p",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: {
        showRating: true,
        showBenefits: false,
        benefits: [],
        showCompareAtPrice: false,
        ctaText: "Comprar",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("PRODUCT: showBenefits exige benefits não vazio", () => {
    const step = {
      id: "p",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: {
        showRating: false,
        showBenefits: true,
        benefits: [],
        showCompareAtPrice: false,
        ctaText: "Comprar",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("PRODUCT: headline/ctaText rejeitam HTML/JS embutido", () => {
    const step = {
      id: "p",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: {
        headline: "<img src=x onerror=alert(1)>",
        showRating: false,
        showBenefits: false,
        benefits: [],
        showCompareAtPrice: false,
        ctaText: "Comprar",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("REWARD: initialProgress fora de 0–100 é rejeitado estruturalmente", () => {
    const step = {
      id: "r",
      type: "REWARD",
      enabled: true,
      order: 0,
      config: {
        title: "Prêmio",
        rewardDisplayType: "GENERIC",
        displayValue: "10",
        initialProgress: 150,
        ctaText: "Ver",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("OFFER: rejeita IDs duplicados", () => {
    const step = {
      id: "o",
      type: "OFFER",
      enabled: true,
      order: 0,
      config: {
        offers: [
          { id: "x", quantity: 1, label: "1x" },
          { id: "x", quantity: 2, label: "2x" },
        ],
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("OFFER: rejeita quantidades duplicadas", () => {
    const step = {
      id: "o",
      type: "OFFER",
      enabled: true,
      order: 0,
      config: {
        offers: [
          { id: "a", quantity: 1, label: "1x" },
          { id: "b", quantity: 1, label: "1x de novo" },
        ],
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("PAYMENT_CHOICE: rejeita quando nenhum método está habilitado", () => {
    const step = {
      id: "pc",
      type: "PAYMENT_CHOICE",
      enabled: true,
      order: 0,
      config: {
        allowCod: false,
        allowOnlinePayment: false,
        codLabel: "COD",
        onlinePaymentLabel: "Online",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("COD_FORM: rejeita chave de campo fora da lista fechada", () => {
    const step = {
      id: "cf",
      type: "COD_FORM",
      enabled: true,
      order: 0,
      config: {
        fields: [{ key: "CPF_ARBITRARIO", enabled: true, required: true }],
        submitButtonText: "Enviar",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("COD_FORM: rejeita campo duplicado", () => {
    const step = {
      id: "cf",
      type: "COD_FORM",
      enabled: true,
      order: 0,
      config: {
        fields: [
          { key: "NAME", enabled: true, required: true },
          { key: "NAME", enabled: true, required: false },
        ],
        submitButtonText: "Enviar",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("UPSELL: productRole precisa ser exatamente 'UPSELL'", () => {
    const step = {
      id: "u",
      type: "UPSELL",
      enabled: true,
      order: 0,
      config: {
        headline: "Leve mais um",
        productRole: "PRIMARY",
        ctaText: "Sim",
        declineText: "Não",
      },
    };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });

  it("tipo de etapa desconhecido é rejeitado pela union discriminada", () => {
    const step = { id: "x", type: "UNKNOWN_TYPE", enabled: true, order: 0, config: {} };
    expect(funnelConfigV1Schema.safeParse(baseConfig([step])).success).toBe(false);
  });
});

describe("parseFunnelConfig", () => {
  it("retorna o config tipado para configSchemaVersion 1", () => {
    const result = parseFunnelConfig(1, PROGRESS_REWARD_COD_TEMPLATE.defaultConfig);
    expect(result.schemaVersion).toBe(1);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("lança ValidationError para configSchemaVersion não suportado", () => {
    expect(() => parseFunnelConfig(999, {})).toThrow();
  });

  it("lança ValidationError para config estruturalmente inválido", () => {
    expect(() => parseFunnelConfig(1, { schemaVersion: 1 })).toThrow();
  });
});
