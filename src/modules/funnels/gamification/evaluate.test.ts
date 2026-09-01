import { describe, expect, it } from "vitest";

import type { OfferItem } from "../config/steps";
import { evaluateGamification, roundProgressForDisplay, type GamificationContext } from "./evaluate";

const offers: OfferItem[] = [
  { id: "o1", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
  { id: "o2", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
];

const messageReward = { type: "MESSAGE_ONLY" as const, message: "Desbloqueado" };
const noOrder: GamificationContext = { selectedOfferId: null, orderConfirmed: false };

describe("evaluateGamification — STATIC_PROGRESS", () => {
  it("mostra sempre o mesmo baseProgress, independente da oferta selecionada", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 85 },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.progressPercent).toBe(85);
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("progresso 0 vira LOCKED, 100 vira READY (nunca COMPLETED sem pedido)", () => {
    const locked = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 0 },
      reward: messageReward,
      milestones: [],
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(locked.status).toBe("LOCKED");

    const ready = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 100 },
      reward: messageReward,
      milestones: [],
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(ready.progressPercent).toBe(100);
    expect(ready.status).toBe("READY");
    expect(ready.unlocked).toBe(false);
  });
});

describe("evaluateGamification — OFFER_SELECTION_PROGRESS", () => {
  it("usa baseProgress sem seleção, e o mapeamento da oferta depois de selecionada", () => {
    const rule = { type: "OFFER_SELECTION_PROGRESS" as const, baseProgress: 85, offerProgress: { o1: 90, o2: 100 } };

    const none = evaluateGamification({ progressRule: rule, reward: messageReward, milestones: [], offers, unitPrice: 89900, context: noOrder });
    expect(none.progressPercent).toBe(85);

    const withO1 = evaluateGamification({
      progressRule: rule,
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o1", orderConfirmed: false },
    });
    expect(withO1.progressPercent).toBe(90);
  });

  it("oferta configurada em 100% sem pedido confirmado: READY, rewardUnlocked=false", () => {
    const rule = { type: "OFFER_SELECTION_PROGRESS" as const, baseProgress: 85, offerProgress: { o2: 100 } };
    const result = evaluateGamification({
      progressRule: rule,
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.progressPercent).toBe(100);
    expect(result.status).toBe("READY");
    expect(result.unlocked).toBe(false);
  });

  it("selectedOfferId inexistente (de outro funil, id inválido) nunca produz benefício — cai no baseProgress", () => {
    const rule = { type: "OFFER_SELECTION_PROGRESS" as const, baseProgress: 20, offerProgress: { o1: 90 } };
    const result = evaluateGamification({
      progressRule: rule,
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "id-de-outro-funil", orderConfirmed: false },
    });
    expect(result.progressPercent).toBe(20);
  });
});

describe("evaluateGamification — VALUE_THRESHOLD", () => {
  it("progresso deriva da economia REAL (referência - oferta), não de um valor digitado", () => {
    // o2: FIXED_TOTAL 149900, referência 2×89900=179800 -> desconto 29900.
    const result = evaluateGamification({
      progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 42000, benefitType: "SAVINGS" },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.currentValue).toBe(29900);
    expect(result.targetValue).toBe(42000);
    expect(result.remainingValue).toBe(12100);
    expect(result.progressPercent).toBeCloseTo((29900 / 42000) * 100, 5);
  });

  it("sem oferta selecionada: currentValue=0, nunca inventa economia", () => {
    const result = evaluateGamification({
      progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 42000, benefitType: "SAVINGS" },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: noOrder,
    });
    expect(result.currentValue).toBe(0);
    expect(result.progressPercent).toBe(0);
    expect(result.status).toBe("LOCKED");
  });

  it("chega a 100% (economia >= meta) sem pedido: READY, rewardUnlocked=false", () => {
    const result = evaluateGamification({
      progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 29900, benefitType: "SAVINGS" },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.progressPercent).toBe(100);
    expect(result.status).toBe("READY");
    expect(result.unlocked).toBe(false);
    expect(result.remainingValue).toBe(0);
  });

  it("economia acima da meta nunca ultrapassa 100% (clamp só no display, aqui é limite estrutural do %)", () => {
    const result = evaluateGamification({
      progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 1000, benefitType: "SAVINGS" },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.progressPercent).toBe(100);
  });
});

describe("evaluateGamification — ORDER_CONFIRMED (override incondicional)", () => {
  it("pedido confirmado sempre produz COMPLETED/100/unlocked=true, mesmo com regra em 0%", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 0 },
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: null, orderConfirmed: true },
    });
    expect(result.progressPercent).toBe(100);
    expect(result.status).toBe("COMPLETED");
    expect(result.unlocked).toBe(true);
  });

  it("VALUE_THRESHOLD chega a 100% sem pedido (READY) e só vira COMPLETED depois do Order local real", () => {
    const rule = { type: "VALUE_THRESHOLD" as const, source: "SELECTED_OFFER_SAVINGS" as const, targetValue: 29900, benefitType: "SAVINGS" as const };
    const context = { selectedOfferId: "o2", orderConfirmed: false };

    const ready = evaluateGamification({ progressRule: rule, reward: messageReward, milestones: [], offers, unitPrice: 89900, context });
    expect(ready.status).toBe("READY");
    expect(ready.unlocked).toBe(false);

    const completed = evaluateGamification({
      progressRule: rule,
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { ...context, orderConfirmed: true },
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.unlocked).toBe(true);
    expect(completed.progressPercent).toBe(100);
  });

  it("OFFER_SELECTION_PROGRESS configurado em 100% sem pedido: READY, rewardUnlocked=false", () => {
    const rule = { type: "OFFER_SELECTION_PROGRESS" as const, baseProgress: 0, offerProgress: { o2: 100 } };
    const result = evaluateGamification({
      progressRule: rule,
      reward: messageReward,
      milestones: [],
      offers,
      unitPrice: 89900,
      context: { selectedOfferId: "o2", orderConfirmed: false },
    });
    expect(result.status).toBe("READY");
    expect(result.unlocked).toBe(false);
  });
});

describe("evaluateGamification — precisão e limites", () => {
  it("nunca produz NaN/Infinity/negativo/acima de 100", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: Number.NaN },
      reward: messageReward,
      milestones: [],
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(Number.isFinite(result.progressPercent)).toBe(true);
    expect(result.progressPercent).toBeGreaterThanOrEqual(0);
    expect(result.progressPercent).toBeLessThanOrEqual(100);
  });

  it("nunca faz clamp artificial para baixo de um 100% matematicamente real (sem 'esconder' em 99%)", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 100 },
      reward: messageReward,
      milestones: [],
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(result.progressPercent).toBe(100);
  });

  it("roundProgressForDisplay só arredonda a exibição, nunca a matemática interna", () => {
    expect(roundProgressForDisplay(85.714285714)).toBe(86);
    expect(roundProgressForDisplay(85.2)).toBe(85);
  });
});

describe("evaluateGamification — milestones", () => {
  const milestones = [
    { progress: 85, label: "Beneficio activado" },
    { progress: 95, label: "Casi listo" },
    { progress: 100, label: "Todo listo" },
  ];

  it("escolhe o milestone mais alto já alcançado", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 96 },
      reward: messageReward,
      milestones,
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(result.milestone?.label).toBe("Casi listo");
  });

  it("nenhum milestone alcançado ainda: null", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 10 },
      reward: messageReward,
      milestones,
      offers: null,
      unitPrice: 0,
      context: noOrder,
    });
    expect(result.milestone).toBeNull();
  });

  it("COMPLETED sempre resolve o milestone de progress=100 (override não perde milestones)", () => {
    const result = evaluateGamification({
      progressRule: { type: "STATIC_PROGRESS", baseProgress: 0 },
      reward: messageReward,
      milestones,
      offers: null,
      unitPrice: 0,
      context: { selectedOfferId: null, orderConfirmed: true },
    });
    expect(result.milestone?.label).toBe("Todo listo");
  });
});
