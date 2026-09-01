import { describe, expect, it } from "vitest";

import {
  buildGamificationAnalyticsEvent,
  isRewardUnlockTransition,
  markGamificationEventSeen,
  shouldEmitGamificationEvent,
  type GamificationAnalyticsEvent,
} from "./analytics";

function event(overrides: Partial<GamificationAnalyticsEvent> = {}): GamificationAnalyticsEvent {
  return buildGamificationAnalyticsEvent({
    type: "gamification_progress_viewed",
    funnelId: "f1",
    funnelVersionId: "v1",
    sessionId: "s1",
    stepId: "reward",
    ruleType: "STATIC_PROGRESS",
    fromProgress: 0,
    toProgress: 85,
    milestoneId: null,
    offerId: null,
    ...overrides,
  });
}

describe("buildGamificationAnalyticsEvent — payload sem PII", () => {
  it("só carrega os campos permitidos pelo spec", () => {
    const e = event();
    expect(Object.keys(e).sort()).toEqual(
      [
        "type",
        "funnelId",
        "funnelVersionId",
        "sessionId",
        "stepId",
        "ruleType",
        "fromProgress",
        "toProgress",
        "milestoneId",
        "offerId",
      ].sort()
    );
  });

  it("nunca contém nome/telefone/endereço/whatsapp", () => {
    const raw = JSON.stringify(event());
    expect(raw).not.toMatch(/name|phone|address|whatsapp/i);
  });
});

describe("shouldEmitGamificationEvent / markGamificationEventSeen — dedup", () => {
  it("primeira ocorrência de uma combinação stepId+type+milestone deve emitir", () => {
    const seen = new Set<string>();
    expect(shouldEmitGamificationEvent(seen, event())).toBe(true);
  });

  it("mesma combinação repetida não deve emitir de novo", () => {
    const seen = new Set<string>();
    const e = event();
    markGamificationEventSeen(seen, e);
    expect(shouldEmitGamificationEvent(seen, e)).toBe(false);
  });

  it("milestone diferente na mesma etapa é uma combinação nova", () => {
    const seen = new Set<string>();
    const first = event({ type: "gamification_milestone_reached", milestoneId: "m1" });
    markGamificationEventSeen(seen, first);
    const second = event({ type: "gamification_milestone_reached", milestoneId: "m2" });
    expect(shouldEmitGamificationEvent(seen, second)).toBe(true);
  });

  it("shouldEmitGamificationEvent nunca muta o set (quem chama decide registrar)", () => {
    const seen = new Set<string>();
    shouldEmitGamificationEvent(seen, event());
    expect(seen.size).toBe(0);
  });
});

describe("isRewardUnlockTransition", () => {
  it("true só na transição PARA COMPLETED vinda de outro estado", () => {
    expect(isRewardUnlockTransition("READY", "COMPLETED")).toBe(true);
    expect(isRewardUnlockTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(isRewardUnlockTransition("LOCKED", "COMPLETED")).toBe(true);
  });

  it("nenhum evento reward_unlocked ao entrar em READY (só progresso matemático, sem pedido)", () => {
    expect(isRewardUnlockTransition("IN_PROGRESS", "READY")).toBe(false);
    expect(isRewardUnlockTransition("LOCKED", "READY")).toBe(false);
  });

  it("permanecer em COMPLETED (re-render) não é uma transição nova", () => {
    expect(isRewardUnlockTransition("COMPLETED", "COMPLETED")).toBe(false);
  });

  it("outras transições nunca contam como unlock", () => {
    expect(isRewardUnlockTransition("LOCKED", "IN_PROGRESS")).toBe(false);
    expect(isRewardUnlockTransition("IN_PROGRESS", "READY")).toBe(false);
  });
});
