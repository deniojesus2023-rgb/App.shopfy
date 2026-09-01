import { describe, expect, it } from "vitest";

import { migrateFunnelConfig } from "./migrate";
import { funnelConfigV1Schema, funnelConfigV2Schema, funnelConfigV3Schema } from "./schema";

const theme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM" as const,
  fontFamily: "SYSTEM" as const,
  buttonStyle: "SOLID" as const,
};

function legacyConfig() {
  return funnelConfigV1Schema.parse({
    schemaVersion: 1,
    theme,
    settings: {},
    steps: [
      {
        id: "success",
        type: "SUCCESS",
        enabled: true,
        order: 0,
        config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
      },
      {
        id: "offer",
        type: "OFFER",
        enabled: true,
        order: 1,
        config: {
          offers: [
            { id: "qty-1", quantity: 1, label: "1x" },
            { id: "qty-2", quantity: 2, label: "2x", badge: "MAIS ESCOLHIDO" },
          ],
        },
      },
    ],
  });
}

describe("migrateFunnelConfig — V1 -> V2", () => {
  it("toda oferta v1 (sem pricing) vira UNIT_MULTIPLIER", () => {
    const migrated = migrateFunnelConfig(1, 2, legacyConfig());
    const parsed = funnelConfigV2Schema.parse(migrated);

    const offerStep = parsed.steps.find((s) => s.type === "OFFER");
    expect(offerStep?.type).toBe("OFFER");
    if (offerStep?.type === "OFFER") {
      expect(offerStep.config.offers.map((o) => o.pricing)).toEqual([
        { type: "UNIT_MULTIPLIER" },
        { type: "UNIT_MULTIPLIER" },
      ]);
    }
  });

  it("nunca perde outros campos da oferta (label, badge, quantity)", () => {
    const migrated = migrateFunnelConfig(1, 2, legacyConfig());
    const parsed = funnelConfigV2Schema.parse(migrated);
    const offerStep = parsed.steps.find((s) => s.type === "OFFER");
    if (offerStep?.type === "OFFER") {
      expect(offerStep.config.offers[1]).toMatchObject({ id: "qty-2", quantity: 2, label: "2x", badge: "MAIS ESCOLHIDO" });
    }
  });

  it("não altera etapas que não são OFFER", () => {
    const migrated = migrateFunnelConfig(1, 2, legacyConfig());
    const parsed = funnelConfigV2Schema.parse(migrated);
    const successStep = parsed.steps.find((s) => s.type === "SUCCESS");
    expect(successStep?.config).toMatchObject({ title: "Sucesso" });
  });

  it("atualiza schemaVersion para 2", () => {
    const migrated = migrateFunnelConfig(1, 2, legacyConfig()) as { schemaVersion: number };
    expect(migrated.schemaVersion).toBe(2);
  });

  it("fromVersion === toVersion é passagem direta, sem tocar no config", () => {
    const config = legacyConfig();
    expect(migrateFunnelConfig(1, 1, config)).toBe(config);
  });

  it("downgrade nunca é suportado", () => {
    expect(() => migrateFunnelConfig(2, 1, {})).toThrow();
  });

  it("versão sem migração registrada lança erro explícito", () => {
    expect(() => migrateFunnelConfig(3, 4, {})).toThrow(/Não existe migração registrada/);
  });
});

function legacyV2Config() {
  return funnelConfigV2Schema.parse({
    schemaVersion: 2,
    theme,
    settings: {},
    steps: [
      {
        id: "success",
        type: "SUCCESS",
        enabled: true,
        order: 0,
        config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
      },
      {
        id: "reward",
        type: "REWARD",
        enabled: true,
        order: 1,
        config: {
          title: "Prêmio",
          subtitle: "Continue para desbloquear",
          rewardDisplayType: "PERCENTAGE",
          displayValue: "15%",
          initialProgress: 85,
          ctaText: "Desbloquear",
        },
      },
    ],
  });
}

describe("migrateFunnelConfig — V2 -> V3", () => {
  it("REWARD v2 (texto/número digitado) vira STATIC_PROGRESS com o MESMO baseProgress", () => {
    const migrated = migrateFunnelConfig(2, 3, legacyV2Config());
    const parsed = funnelConfigV3Schema.parse(migrated);

    const rewardStep = parsed.steps.find((s) => s.type === "REWARD");
    expect(rewardStep?.type).toBe("REWARD");
    if (rewardStep?.type === "REWARD") {
      expect(rewardStep.config.progressRule).toEqual({ type: "STATIC_PROGRESS", baseProgress: 85 });
    }
  });

  it("nunca migra rewardDisplayType/displayValue (texto sem regra real) para a recompensa", () => {
    const migrated = migrateFunnelConfig(2, 3, legacyV2Config());
    const parsed = funnelConfigV3Schema.parse(migrated);
    const rewardStep = parsed.steps.find((s) => s.type === "REWARD");
    if (rewardStep?.type === "REWARD") {
      expect(rewardStep.config.reward).not.toHaveProperty("displayValue");
      // subtitle vira a mensagem final — nenhum valor monetário inventado.
      expect(rewardStep.config.reward).toEqual({ type: "MESSAGE_ONLY", message: "Continue para desbloquear" });
    }
  });

  it("subtitle vazio cai no texto neutro padrão, nunca string vazia", () => {
    const config = legacyV2Config();
    (config.steps[1] as { config: { subtitle?: string } }).config.subtitle = undefined;
    const migrated = migrateFunnelConfig(2, 3, config);
    const parsed = funnelConfigV3Schema.parse(migrated);
    const rewardStep = parsed.steps.find((s) => s.type === "REWARD");
    if (rewardStep?.type === "REWARD") {
      expect(rewardStep.config.reward).toEqual({ type: "MESSAGE_ONLY", message: "Beneficio desbloqueado." });
    }
  });

  it("nunca inventa milestones (lista vazia)", () => {
    const migrated = migrateFunnelConfig(2, 3, legacyV2Config());
    const parsed = funnelConfigV3Schema.parse(migrated);
    const rewardStep = parsed.steps.find((s) => s.type === "REWARD");
    if (rewardStep?.type === "REWARD") {
      expect(rewardStep.config.milestones).toEqual([]);
    }
  });

  it("não altera etapas que não são REWARD", () => {
    const migrated = migrateFunnelConfig(2, 3, legacyV2Config());
    const parsed = funnelConfigV3Schema.parse(migrated);
    const successStep = parsed.steps.find((s) => s.type === "SUCCESS");
    expect(successStep?.config).toMatchObject({ title: "Sucesso" });
  });

  it("atualiza schemaVersion para 3", () => {
    const migrated = migrateFunnelConfig(2, 3, legacyV2Config()) as { schemaVersion: number };
    expect(migrated.schemaVersion).toBe(3);
  });

  it("encadeia 1 -> 3 automaticamente (V1 -> V2 -> V3 numa chamada só)", () => {
    const migrated = migrateFunnelConfig(1, 3, legacyConfig()) as { schemaVersion: number };
    expect(migrated.schemaVersion).toBe(3);
    const parsed = funnelConfigV3Schema.parse(migrated);
    const offerStep = parsed.steps.find((s) => s.type === "OFFER");
    if (offerStep?.type === "OFFER") {
      expect(offerStep.config.offers[0].pricing).toEqual({ type: "UNIT_MULTIPLIER" });
    }
  });
});
