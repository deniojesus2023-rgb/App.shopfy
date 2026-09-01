import type { GamificationMilestone, GamificationProgressRule, GamificationReward } from "../config/gamification";
import { resolveOfferPrice } from "../pricing/resolve-offer-price";
import type { OfferItem } from "../config/steps";

/**
 * Insumo do motor — deliberadamente mínimo. `funnelVersionId`/`stepId`/
 * `sessionId` NÃO entram aqui: são campos de EVENTO de analytics, não
 * insumo de cálculo (ver gamification/analytics.ts). Mantém
 * `evaluateGamification` genuinamente puro e sem saber onde está sendo
 * chamado. Nenhum PII.
 */
export interface GamificationContext {
  selectedOfferId: string | null;
  /**
   * true SÓ depois que o Order local foi REALMENTE criado no servidor
   * (Fase 3) — nunca por clique de botão. É o único jeito de a recompensa
   * ser desbloqueada nesta fase (ver `status`/`rewardUnlocked` abaixo).
   */
  orderConfirmed: boolean;
}

export type GamificationStatus = "LOCKED" | "IN_PROGRESS" | "READY" | "COMPLETED";

export interface GamificationResult {
  /**
   * Percentual matemático exato da regra configurada — NUNCA sofre clamp
   * artificial para baixo (ex.: nunca vira 99% para "esconder" que a
   * matemática deu 100). A verdade do progresso e a condição comercial de
   * desbloqueio são coisas DIFERENTES — ver `status`/`unlocked`.
   */
  progressPercent: number;
  status: GamificationStatus;
  /**
   * SEMPRE `context.orderConfirmed` — nunca `progressPercent >= 100`.
   * Uma regra VALUE_THRESHOLD/OFFER_SELECTION_PROGRESS pode chegar
   * matematicamente a 100% antes do checkout (status vira READY), mas
   * isso não é a recompensa final sendo liberada.
   */
  unlocked: boolean;
  currentValue: number | null;
  targetValue: number | null;
  remainingValue: number | null;
  milestone: GamificationMilestone | null;
  reward: GamificationReward;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function pickMilestone(progress: number, milestones: GamificationMilestone[]): GamificationMilestone | null {
  let picked: GamificationMilestone | null = null;
  for (const m of milestones) {
    if (m.progress <= progress && (!picked || m.progress > picked.progress)) {
      picked = m;
    }
  }
  return picked;
}

function statusForProgress(progress: number): "LOCKED" | "IN_PROGRESS" | "READY" {
  if (progress <= 0) return "LOCKED";
  if (progress >= 100) return "READY";
  return "IN_PROGRESS";
}

interface RuleOutcome {
  progressPercent: number;
  currentValue: number | null;
  targetValue: number | null;
  remainingValue: number | null;
}

function evaluateRule(
  rule: GamificationProgressRule,
  offers: OfferItem[] | null,
  unitPrice: number,
  selectedOfferId: string | null
): RuleOutcome {
  switch (rule.type) {
    case "STATIC_PROGRESS":
      return { progressPercent: clampProgress(rule.baseProgress), currentValue: null, targetValue: null, remainingValue: null };

    case "OFFER_SELECTION_PROGRESS": {
      const mapped = selectedOfferId !== null ? rule.offerProgress[selectedOfferId] : undefined;
      const progress = mapped ?? rule.baseProgress;
      return { progressPercent: clampProgress(progress), currentValue: null, targetValue: null, remainingValue: null };
    }

    case "VALUE_THRESHOLD": {
      const offer = selectedOfferId !== null ? (offers ?? []).find((o) => o.id === selectedOfferId) : undefined;
      // Sem oferta selecionada (ou id desconhecido/de outro funil): nenhuma
      // economia foi realizada de fato ainda — nunca inventa um valor.
      const currentValue = offer ? Math.max(0, resolveOfferPrice(unitPrice, offer).discount) : 0;
      const progressPercent = clampProgress((currentValue / rule.targetValue) * 100);
      return {
        progressPercent,
        currentValue,
        targetValue: rule.targetValue,
        remainingValue: Math.max(0, rule.targetValue - currentValue),
      };
    }
  }
}

/**
 * Único ponto que calcula progresso/recompensa (Fase 4B). Pura: sem I/O,
 * sem rede, sem React, sem estado global — pode ser chamada quantas vezes
 * for preciso durante render/interação, no client e no servidor. Usada
 * identicamente pelo Builder (preview), pelo Storefront e por qualquer
 * verificação futura server-side.
 */
export function evaluateGamification(params: {
  progressRule: GamificationProgressRule;
  reward: GamificationReward;
  milestones: GamificationMilestone[];
  offers: OfferItem[] | null;
  unitPrice: number;
  context: GamificationContext;
}): GamificationResult {
  const outcome = evaluateRule(params.progressRule, params.offers, params.unitPrice, params.context.selectedOfferId);

  // Override incondicional: pedido local confirmado é o ÚNICO jeito de
  // COMPLETED/unlocked=true existir. Nenhuma regra de progresso, por mais
  // que "dê 100%", pode produzir isso sozinha.
  if (params.context.orderConfirmed) {
    return {
      progressPercent: 100,
      status: "COMPLETED",
      unlocked: true,
      currentValue: outcome.currentValue,
      targetValue: outcome.targetValue,
      remainingValue: outcome.targetValue !== null ? 0 : null,
      milestone: pickMilestone(100, params.milestones),
      reward: params.reward,
    };
  }

  return {
    progressPercent: outcome.progressPercent,
    status: statusForProgress(outcome.progressPercent),
    unlocked: false,
    currentValue: outcome.currentValue,
    targetValue: outcome.targetValue,
    remainingValue: outcome.remainingValue,
    milestone: pickMilestone(outcome.progressPercent, params.milestones),
    reward: params.reward,
  };
}

/** Arredondamento só para EXIBIÇÃO — o motor nunca trunca a matemática internamente. */
export function roundProgressForDisplay(progressPercent: number): number {
  return Math.round(progressPercent);
}
