import { beforeEach, describe, expect, it } from "vitest";

import type { RuntimeState } from "./state";
import { clearRuntimeSession, readRuntimeSession, writeRuntimeSession } from "./session-storage";

class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

function baseState(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return {
    sessionId: "sess_1",
    funnelId: "funnel_1",
    funnelVersionId: "version_1",
    currentStepId: "product",
    completedStepIds: [],
    selectedOfferId: null,
    selectedQuantity: null,
    selectedPaymentMethod: null,
    rewardProgress: 0,
    rewardUnlocked: false,
    upsellAccepted: null,
    checkoutAttemptId: "attempt_1",
    lastOrder: null,
    ...overrides,
  };
}

beforeEach(() => {
  // @ts-expect-error — stub mínimo do Storage global só para os testes.
  globalThis.sessionStorage = new FakeStorage();
});

describe("readRuntimeSession / writeRuntimeSession", () => {
  it("restaura uma sessão salva para a mesma funnelVersionId", () => {
    const state = baseState({ currentStepId: "offer", selectedOfferId: "o1" });
    writeRuntimeSession(state);

    const restored = readRuntimeSession("funnel_1", "version_1");
    expect(restored).toEqual(state);
  });

  it("rejeita sessão de uma funnelVersionId diferente (nunca mistura versões)", () => {
    writeRuntimeSession(baseState({ funnelVersionId: "version_1" }));

    const restored = readRuntimeSession("funnel_1", "version_2");
    expect(restored).toBeNull();
  });

  it("retorna null quando não há sessão salva", () => {
    expect(readRuntimeSession("funnel_1", "version_1")).toBeNull();
  });

  it("retorna null para JSON corrompido no storage, sem lançar", () => {
    sessionStorage.setItem("funnel_session:funnel_1", "{not-json");
    expect(readRuntimeSession("funnel_1", "version_1")).toBeNull();
  });

  it("retorna null quando a forma armazenada não bate com RuntimeState", () => {
    sessionStorage.setItem("funnel_session:funnel_1", JSON.stringify({ foo: "bar" }));
    expect(readRuntimeSession("funnel_1", "version_1")).toBeNull();
  });

  it("clearRuntimeSession remove a sessão", () => {
    writeRuntimeSession(baseState());
    clearRuntimeSession("funnel_1");
    expect(readRuntimeSession("funnel_1", "version_1")).toBeNull();
  });

  it("nunca serializa campos de PII — só as chaves conhecidas do RuntimeState", () => {
    writeRuntimeSession(baseState());
    const raw = sessionStorage.getItem("funnel_session:funnel_1")!;
    const parsed = JSON.parse(raw);

    const allowedKeys = new Set([
      "sessionId",
      "funnelId",
      "funnelVersionId",
      "currentStepId",
      "completedStepIds",
      "selectedOfferId",
      "selectedQuantity",
      "selectedPaymentMethod",
      "rewardProgress",
      "rewardUnlocked",
      "upsellAccepted",
      "checkoutAttemptId",
      "lastOrder",
    ]);
    for (const key of Object.keys(parsed)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
    // Nenhum rótulo que sugira dado pessoal (nome, telefone, endereço).
    expect(raw).not.toMatch(/name|phone|address|whatsapp/i);
  });
});
