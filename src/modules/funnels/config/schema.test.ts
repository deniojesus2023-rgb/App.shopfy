import { describe, expect, it } from "vitest";

import { funnelConfigV1Schema, funnelConfigV2Schema, funnelConfigV3Schema, funnelConfigV4Schema } from "./schema";
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

describe("funnelConfigV4Schema — template atual", () => {
  it("aceita o template seed válido (V4, PAYMENT_CHOICE com paymentMethods reais)", () => {
    expect(funnelConfigV4Schema.safeParse(PROGRESS_REWARD_COD_TEMPLATE.defaultConfig).success).toBe(true);
  });
});

// Shape v3 de verdade (Fase 4B): REWARD já com regra real, mas
// PAYMENT_CHOICE ainda allowCod/allowOnlinePayment — exatamente o que uma
// FunnelVersion PUBLISHED entre a Fase 4B e a Fase 4C tem gravado no banco.
const legacyV3Config = {
  schemaVersion: 3,
  theme: validTheme,
  settings: {},
  steps: [
    successStep("s", 0),
    {
      id: "p",
      type: "PAYMENT_CHOICE",
      enabled: true,
      order: 1,
      config: { allowCod: true, allowOnlinePayment: false, codLabel: "COD", onlinePaymentLabel: "Online" },
    },
  ],
};

describe("funnelConfigV3Schema — estrutura legada (Fase 4B)", () => {
  it("aceita config v3 de verdade (REWARD com regra real, PAYMENT_CHOICE ainda allowCod/allowOnlinePayment)", () => {
    expect(funnelConfigV3Schema.safeParse(legacyV3Config).success).toBe(true);
  });
});

// Shape v2 de verdade (Fase 4A): OFFER já com `pricing`, mas REWARD ainda
// texto/número digitado — exatamente o que uma FunnelVersion PUBLISHED
// entre a Fase 4A e a Fase 4B tem gravado no banco.
const legacyV2Config = {
  schemaVersion: 2,
  theme: validTheme,
  settings: {},
  steps: [
    successStep("s", 0),
    {
      id: "o",
      type: "OFFER",
      enabled: true,
      order: 1,
      config: { offers: [{ id: "qty-1", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } }] },
    },
    {
      id: "r",
      type: "REWARD",
      enabled: true,
      order: 2,
      config: {
        title: "Prêmio",
        subtitle: "Continue",
        rewardDisplayType: "PERCENTAGE",
        displayValue: "15%",
        initialProgress: 85,
        ctaText: "Desbloquear",
      },
    },
  ],
};

describe("funnelConfigV2Schema — estrutura legada (Fase 4A)", () => {
  it("aceita config v2 de verdade (OFFER com pricing, REWARD ainda texto/número)", () => {
    expect(funnelConfigV2Schema.safeParse(legacyV2Config).success).toBe(true);
  });
});

describe("funnelConfigV1Schema — estrutura geral (legado)", () => {
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

const legacyV1Config = {
  schemaVersion: 1,
  theme: validTheme,
  settings: {},
  steps: [
    successStep("s", 0),
    {
      id: "o",
      type: "OFFER",
      enabled: true,
      order: 1,
      // Shape v1 de verdade: sem `pricing` — é exatamente o que uma
      // FunnelVersion PUBLISHED antes da Fase 4A tem gravado no banco.
      config: { offers: [{ id: "qty-1", quantity: 1, label: "1x" }] },
    },
  ],
};

describe("parseFunnelConfig", () => {
  it("retorna o config tipado para configSchemaVersion 4 (atual)", () => {
    const result = parseFunnelConfig(4, PROGRESS_REWARD_COD_TEMPLATE.defaultConfig);
    expect(result.schemaVersion).toBe(4);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("migra configSchemaVersion 3 para o shape atual (V4) em memória — PAYMENT_CHOICE ganha paymentMethods reais", () => {
    const result = parseFunnelConfig(3, legacyV3Config);
    expect(result.schemaVersion).toBe(4);
    const paymentStep = result.steps.find((s) => s.type === "PAYMENT_CHOICE");
    expect(paymentStep?.type).toBe("PAYMENT_CHOICE");
    if (paymentStep?.type === "PAYMENT_CHOICE") {
      const cod = paymentStep.config.paymentMethods.find((m) => m.method === "COD");
      expect(cod).toMatchObject({ provider: "INTERNAL_COD", enabled: true, pricing: { type: "NONE" } });
    }
  });

  it("migra configSchemaVersion 2 para o shape atual (V4) em memória, encadeando 2->3->4 — REWARD ganha regra real", () => {
    const result = parseFunnelConfig(2, legacyV2Config);
    expect(result.schemaVersion).toBe(4);
    const rewardStep = result.steps.find((s) => s.type === "REWARD");
    expect(rewardStep?.type).toBe("REWARD");
    if (rewardStep?.type === "REWARD") {
      // Mesmo baseProgress que o initialProgress antigo mostrava — o
      // comportamento visual não muda, só deixa de ser texto solto.
      expect(rewardStep.config.progressRule).toEqual({ type: "STATIC_PROGRESS", baseProgress: 85 });
      expect(rewardStep.config.reward).toEqual({ type: "MESSAGE_ONLY", message: "Continue" });
    }
  });

  it("migra configSchemaVersion 1 para o shape atual (V4) em memória, encadeando 1->2->3->4", () => {
    const result = parseFunnelConfig(1, legacyV1Config);
    expect(result.schemaVersion).toBe(4);
    const offerStep = result.steps.find((s) => s.type === "OFFER");
    expect(offerStep?.type).toBe("OFFER");
    if (offerStep?.type === "OFFER") {
      expect(offerStep.config.offers[0].pricing).toEqual({ type: "UNIT_MULTIPLIER" });
    }
  });

  it("lança ValidationError para configSchemaVersion não suportado", () => {
    expect(() => parseFunnelConfig(999, {})).toThrow();
  });

  it("lança ValidationError para config estruturalmente inválido", () => {
    expect(() => parseFunnelConfig(1, { schemaVersion: 1 })).toThrow();
  });

  it("lança ValidationError para config v2 estruturalmente inválido", () => {
    expect(() => parseFunnelConfig(2, { schemaVersion: 2 })).toThrow();
  });

  it("lança ValidationError para config v3 estruturalmente inválido", () => {
    expect(() => parseFunnelConfig(3, { schemaVersion: 3 })).toThrow();
  });

  it("lança ValidationError para config v4 estruturalmente inválido", () => {
    expect(() => parseFunnelConfig(4, { schemaVersion: 4 })).toThrow();
  });
});
