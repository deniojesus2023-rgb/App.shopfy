import type { GamificationStatus } from "./evaluate";

/**
 * Payload permitido (spec Fase 4B item 24) — nenhum campo de PII. Formato
 * puro, sem I/O: só molda o evento, nunca envia nada. A persistência real
 * (endpoint, tabela) fica deliberadamente fora desta fase — ver README.
 */
export interface GamificationAnalyticsEvent {
  type: "gamification_progress_viewed" | "gamification_milestone_reached" | "reward_unlocked";
  funnelId: string;
  funnelVersionId: string;
  sessionId: string;
  stepId: string;
  ruleType: string;
  fromProgress: number;
  toProgress: number;
  milestoneId: string | null;
  offerId: string | null;
}

export function buildGamificationAnalyticsEvent(params: {
  type: GamificationAnalyticsEvent["type"];
  funnelId: string;
  funnelVersionId: string;
  sessionId: string;
  stepId: string;
  ruleType: string;
  fromProgress: number;
  toProgress: number;
  milestoneId: string | null;
  offerId: string | null;
}): GamificationAnalyticsEvent {
  return { ...params };
}

/**
 * Chave de deduplicação: mesma etapa + mesmo tipo de evento + mesmo
 * milestone (quando houver) não deve gerar um segundo evento na mesma
 * sessão — nunca "bilhões de eventos" a cada render (spec item 23).
 */
function dedupeKey(event: GamificationAnalyticsEvent): string {
  return [event.type, event.stepId, event.milestoneId ?? ""].join("::");
}

/**
 * `seen` é o conjunto (mutável, mantido pelo caller — ex.: um `Set` em
 * memória por sessão do runtime) de chaves já emitidas. Retorna `true` só
 * na primeira vez que aquela combinação aparece; nunca muta `seen` — quem
 * chama decide se/quando registrar a chave como vista.
 */
export function shouldEmitGamificationEvent(seen: ReadonlySet<string>, event: GamificationAnalyticsEvent): boolean {
  return !seen.has(dedupeKey(event));
}

export function markGamificationEventSeen(seen: Set<string>, event: GamificationAnalyticsEvent): void {
  seen.add(dedupeKey(event));
}

/**
 * `reward_unlocked` só faz sentido na TRANSIÇÃO para COMPLETED — nunca
 * enquanto o status é READY (progresso matemático em 100% sem pedido
 * confirmado). Ver evaluate.ts: `unlocked` é sempre `orderConfirmed`,
 * nunca `progressPercent >= 100`.
 */
export function isRewardUnlockTransition(fromStatus: GamificationStatus, toStatus: GamificationStatus): boolean {
  return toStatus === "COMPLETED" && fromStatus !== "COMPLETED";
}
