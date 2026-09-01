import { describe, expect, it } from "vitest";

import type { FunnelStep } from "../config/steps";
import {
  canNavigateToStep,
  createInitialRuntimeState,
  getEnabledSteps,
  runtimeReducer,
  type RuntimeState,
} from "./state";

function step(overrides: Partial<{ id: string; type: FunnelStep["type"]; enabled: boolean; order: number }>): FunnelStep {
  const base = { id: overrides.id ?? "s", enabled: overrides.enabled ?? true, order: overrides.order ?? 0 };
  const type = overrides.type ?? "SUCCESS";

  switch (type) {
    case "PRODUCT":
      return {
        ...base,
        type: "PRODUCT",
        config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "x" },
      };
    case "OFFER":
      return {
        ...base,
        type: "OFFER",
        config: { offers: [{ id: "o1", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } }] },
      };
    default:
      return {
        ...base,
        type: "SUCCESS",
        config: { title: "t", showOrderNumber: false, showRewardProgress: false },
      };
  }
}

function baseState(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sessionId: "sess_1",
    funnelId: "funnel_1",
    funnelVersionId: "version_1",
    currentStepId: "step-1",
    completedStepIds: [],
    selectedOfferId: null,
    selectedQuantity: null,
    selectedPaymentMethod: null,
    upsellAccepted: null,
    checkoutAttemptId: "attempt_1",
    lastOrder: null,
    ...overrides,
  };
}

describe("getEnabledSteps", () => {
  it("filtra desabilitadas e ordena por order", () => {
    const steps = [
      step({ id: "b", order: 1 }),
      step({ id: "a", order: 0 }),
      step({ id: "disabled", order: -1, enabled: false }),
    ];
    expect(getEnabledSteps(steps).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("createInitialRuntimeState", () => {
  it("começa na primeira etapa habilitada, sem nada completo", () => {
    const steps = [step({ id: "first", order: 0 }), step({ id: "second", order: 1 })];
    const state = createInitialRuntimeState({
      sessionId: "s1",
      funnelId: "f1",
      funnelVersionId: "v1",
      steps,
      checkoutAttemptId: "attempt_1",
    });
    expect(state.currentStepId).toBe("first");
    expect(state.completedStepIds).toEqual([]);
  });
});

describe("runtimeReducer — navegação", () => {
  const steps = [step({ id: "a", order: 0 }), step({ id: "b", order: 1 }), step({ id: "c", order: 2 })];

  it("NEXT_STEP avança e marca a etapa atual como completa", () => {
    const state = baseState({ currentStepId: "a" });
    const next = runtimeReducer(state, { type: "NEXT_STEP", steps });
    expect(next.currentStepId).toBe("b");
    expect(next.completedStepIds).toEqual(["a"]);
  });

  it("NEXT_STEP na última etapa não faz nada", () => {
    const state = baseState({ currentStepId: "c" });
    const next = runtimeReducer(state, { type: "NEXT_STEP", steps });
    expect(next).toBe(state);
  });

  it("PREVIOUS_STEP volta sem alterar completedStepIds", () => {
    const state = baseState({ currentStepId: "b", completedStepIds: ["a"] });
    const prev = runtimeReducer(state, { type: "PREVIOUS_STEP", steps });
    expect(prev.currentStepId).toBe("a");
    expect(prev.completedStepIds).toEqual(["a"]);
  });

  it("PREVIOUS_STEP na primeira etapa não faz nada", () => {
    const state = baseState({ currentStepId: "a" });
    const prev = runtimeReducer(state, { type: "PREVIOUS_STEP", steps });
    expect(prev).toBe(state);
  });

  it("GO_TO_STEP para a etapa atual é sempre permitido", () => {
    const state = baseState({ currentStepId: "a" });
    const result = runtimeReducer(state, { type: "GO_TO_STEP", stepId: "a", steps });
    expect(result.currentStepId).toBe("a");
  });

  it("GO_TO_STEP para etapa já completada é permitido", () => {
    const state = baseState({ currentStepId: "b", completedStepIds: ["a"] });
    const result = runtimeReducer(state, { type: "GO_TO_STEP", stepId: "a", steps });
    expect(result.currentStepId).toBe("a");
  });

  it("GO_TO_STEP para etapa nunca alcançada é rejeitado (não pula à frente)", () => {
    const state = baseState({ currentStepId: "a", completedStepIds: [] });
    const result = runtimeReducer(state, { type: "GO_TO_STEP", stepId: "c", steps });
    expect(result.currentStepId).toBe("a");
  });

  it("canNavigateToStep reflete a mesma regra usada pelo reducer", () => {
    const state = baseState({ currentStepId: "b", completedStepIds: ["a"] });
    expect(canNavigateToStep(state, steps, "a")).toBe(true);
    expect(canNavigateToStep(state, steps, "b")).toBe(true);
    expect(canNavigateToStep(state, steps, "c")).toBe(false);
  });
});

describe("runtimeReducer — seleções", () => {
  it("SELECT_OFFER atualiza offerId e quantity juntos", () => {
    const result = runtimeReducer(baseState(), { type: "SELECT_OFFER", offerId: "o2", quantity: 2 });
    expect(result.selectedOfferId).toBe("o2");
    expect(result.selectedQuantity).toBe(2);
  });

  it("SELECT_PAYMENT_METHOD atualiza o método escolhido", () => {
    const result = runtimeReducer(baseState(), { type: "SELECT_PAYMENT_METHOD", method: "COD" });
    expect(result.selectedPaymentMethod).toBe("COD");
  });

  it("ACCEPT_UPSELL / DECLINE_UPSELL setam upsellAccepted", () => {
    expect(runtimeReducer(baseState(), { type: "ACCEPT_UPSELL" }).upsellAccepted).toBe(true);
    expect(runtimeReducer(baseState(), { type: "DECLINE_UPSELL" }).upsellAccepted).toBe(false);
  });

  it("ORDER_CONFIRMED guarda a confirmação do pedido (só depois de criado no servidor)", () => {
    const order = { publicOrderId: "pub1", orderNumber: 1048, status: "PENDING", total: "89900.00", currency: "COP" };
    const result = runtimeReducer(baseState(), { type: "ORDER_CONFIRMED", order });
    expect(result.lastOrder).toEqual(order);
  });

  it("RESTORE substitui o estado inteiro", () => {
    const restored = baseState({ currentStepId: "z", selectedOfferId: "o1" });
    const result = runtimeReducer(baseState(), { type: "RESTORE", state: restored });
    expect(result).toEqual(restored);
  });
});
