import { describe, expect, it } from "vitest";

import type { OfferItem } from "../config/steps";
import { computeGamificationWarnings } from "./warnings";

const offers: OfferItem[] = [
  { id: "o1", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } },
  { id: "o2", quantity: 2, label: "2x", pricing: { type: "UNIT_MULTIPLIER" } },
  { id: "o3", quantity: 3, label: "3x", pricing: { type: "UNIT_MULTIPLIER" } },
];

describe("computeGamificationWarnings — não bloqueante", () => {
  it("nenhum aviso quando o progresso cresce com a quantidade", () => {
    const warnings = computeGamificationWarnings(
      { type: "OFFER_SELECTION_PROGRESS", baseProgress: 85, offerProgress: { o1: 90, o2: 95, o3: 100 } },
      offers
    );
    expect(warnings).toEqual([]);
  });

  it("avisa quando o progresso cai numa oferta 'maior' (mapeamento provavelmente invertido)", () => {
    const warnings = computeGamificationWarnings(
      { type: "OFFER_SELECTION_PROGRESS", baseProgress: 85, offerProgress: { o1: 100, o2: 50, o3: 90 } },
      offers
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].path).toContain("o2");
  });

  it("STATIC_PROGRESS e VALUE_THRESHOLD nunca geram este aviso (não são mapeamento por oferta)", () => {
    expect(computeGamificationWarnings({ type: "STATIC_PROGRESS", baseProgress: 50 }, offers)).toEqual([]);
    expect(
      computeGamificationWarnings(
        { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 1000, benefitType: "SAVINGS" },
        offers
      )
    ).toEqual([]);
  });

  it("sem etapa OFFER (offers=null), nunca lança — só não tem o que avisar", () => {
    expect(
      computeGamificationWarnings({ type: "OFFER_SELECTION_PROGRESS", baseProgress: 0, offerProgress: {} }, null)
    ).toEqual([]);
  });
});
