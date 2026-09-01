import { describe, expect, it } from "vitest";

import { builderReducer, createBuilderState } from "./builder-state";
import type { FunnelConfig } from "@/modules/funnels/config/schema";

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

function offerStep(overrides: Partial<{ id: string; order: number; enabled: boolean }> = {}) {
  return {
    id: overrides.id ?? "offer",
    type: "OFFER" as const,
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 2,
    config: { offers: [{ id: "o1", quantity: 1, label: "Unidade", pricing: { type: "UNIT_MULTIPLIER" as const } }] },
  };
}

function config(steps: FunnelConfig["steps"]): FunnelConfig {
  return { schemaVersion: 4, theme, steps, settings: {} };
}

describe("createBuilderState", () => {
  it("seleciona o primeiro step por order e inicia não-dirty", () => {
    const state = createBuilderState(config([successStep({ order: 1 }), productStep({ order: 0 })]), 3);
    expect(state.selected).toEqual({ kind: "step", stepId: "product" });
    expect(state.dirty).toBe(false);
    expect(state.revision).toBe(3);
    expect(state.saveStatus).toBe("idle");
  });

  it("seleciona theme quando não há steps", () => {
    const state = createBuilderState(config([]), 1);
    expect(state.selected).toEqual({ kind: "theme" });
  });
});

describe("builderReducer", () => {
  it("UPDATE_STEP marca dirty e substitui apenas o step alvo", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const updated = { ...productStep(), config: { ...productStep().config, ctaText: "Novo" } };
    const next = builderReducer(state, { type: "UPDATE_STEP", stepId: "product", step: updated });
    expect(next.dirty).toBe(true);
    expect(next.draftConfig.steps.find((s) => s.id === "product")?.config).toMatchObject({ ctaText: "Novo" });
    expect(next.draftConfig.steps.find((s) => s.id === "success")).toBeDefined();
  });

  it("TOGGLE_STEP_ENABLED inverte enabled do step alvo apenas", () => {
    const state = createBuilderState(config([productStep(), successStep(), offerStep()]), 1);
    const next = builderReducer(state, { type: "TOGGLE_STEP_ENABLED", stepId: "offer" });
    expect(next.draftConfig.steps.find((s) => s.id === "offer")?.enabled).toBe(false);
    expect(next.draftConfig.steps.find((s) => s.id === "product")?.enabled).toBe(true);
    expect(next.dirty).toBe(true);
  });

  it("MOVE_STEP up/down renumera order contíguo sem lacunas/duplicatas", () => {
    const state = createBuilderState(config([productStep(), successStep(), offerStep()]), 1);
    const next = builderReducer(state, { type: "MOVE_STEP", stepId: "offer", direction: "up" });
    const ordered = [...next.draftConfig.steps].sort((a, b) => a.order - b.order);
    expect(ordered.map((s) => s.id)).toEqual(["product", "offer", "success"]);
    expect(ordered.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("MOVE_STEP no limite (primeiro para cima) é no-op", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const next = builderReducer(state, { type: "MOVE_STEP", stepId: "product", direction: "up" });
    expect(next).toBe(state);
  });

  it("MOVE_STEP no limite (último para baixo) é no-op", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const next = builderReducer(state, { type: "MOVE_STEP", stepId: "success", direction: "down" });
    expect(next).toBe(state);
  });

  it("UPDATE_THEME marca dirty e substitui o theme", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const next = builderReducer(state, {
      type: "UPDATE_THEME",
      theme: { ...theme, primaryColor: "#FF0000" },
    });
    expect(next.dirty).toBe(true);
    expect(next.draftConfig.theme.primaryColor).toBe("#FF0000");
  });

  it("SAVE_START/SAVE_SUCCESS: sucesso limpa dirty, atualiza revision e originalConfig", () => {
    let state = createBuilderState(config([productStep(), successStep()]), 1);
    state = builderReducer(state, {
      type: "UPDATE_THEME",
      theme: { ...theme, primaryColor: "#ABCDEF" },
    });
    state = builderReducer(state, { type: "SAVE_START" });
    expect(state.saveStatus).toBe("saving");

    state = builderReducer(state, { type: "SAVE_SUCCESS", revision: 2 });
    expect(state.saveStatus).toBe("saved");
    expect(state.dirty).toBe(false);
    expect(state.revision).toBe(2);
    expect(state.originalConfig.theme.primaryColor).toBe("#ABCDEF");
  });

  it("SAVE_ERROR guarda a mensagem e mantém dirty", () => {
    let state = createBuilderState(config([productStep(), successStep()]), 1);
    state = builderReducer(state, { type: "UPDATE_THEME", theme });
    state = builderReducer(state, { type: "SAVE_ERROR", message: "Falha ao salvar" });
    expect(state.saveStatus).toBe("error");
    expect(state.saveError).toBe("Falha ao salvar");
    expect(state.dirty).toBe(true);
  });

  it("SAVE_CONFLICT marca saveStatus conflict sem alterar draftConfig", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const next = builderReducer(state, { type: "SAVE_CONFLICT" });
    expect(next.saveStatus).toBe("conflict");
    expect(next.draftConfig).toBe(state.draftConfig);
  });

  it("DISMISS_CONFLICT volta para idle preservando dirty e draftConfig (sem merge automático)", () => {
    let state = createBuilderState(config([productStep(), successStep()]), 1);
    state = builderReducer(state, { type: "UPDATE_THEME", theme: { ...theme, primaryColor: "#123456" } });
    state = builderReducer(state, { type: "SAVE_CONFLICT" });
    const next = builderReducer(state, { type: "DISMISS_CONFLICT" });
    expect(next.saveStatus).toBe("idle");
    expect(next.dirty).toBe(true);
    expect(next.draftConfig.theme.primaryColor).toBe("#123456");
  });

  it("RELOAD_FROM_SERVER substitui draft/original e limpa dirty", () => {
    let state = createBuilderState(config([productStep(), successStep()]), 1);
    state = builderReducer(state, { type: "UPDATE_THEME", theme: { ...theme, primaryColor: "#123456" } });
    const serverConfig = config([productStep(), successStep(), offerStep()]);
    const next = builderReducer(state, { type: "RELOAD_FROM_SERVER", config: serverConfig, revision: 5 });
    expect(next.dirty).toBe(false);
    expect(next.revision).toBe(5);
    expect(next.draftConfig).toBe(serverConfig);
    expect(next.originalConfig).toBe(serverConfig);
    expect(next.saveStatus).toBe("idle");
  });

  it("SELECT_STEP e SELECT_THEME alternam o painel selecionado", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const selectSuccess = builderReducer(state, { type: "SELECT_STEP", stepId: "success" });
    expect(selectSuccess.selected).toEqual({ kind: "step", stepId: "success" });
    const selectTheme = builderReducer(selectSuccess, { type: "SELECT_THEME" });
    expect(selectTheme.selected).toEqual({ kind: "theme" });
  });

  it("SET_PREVIEW_DEVICE alterna mobile/desktop", () => {
    const state = createBuilderState(config([productStep(), successStep()]), 1);
    const next = builderReducer(state, { type: "SET_PREVIEW_DEVICE", device: "desktop" });
    expect(next.previewDevice).toBe("desktop");
  });
});
