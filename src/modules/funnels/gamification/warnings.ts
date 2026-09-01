import type { GamificationProgressRule } from "../config/gamification";
import type { OfferItem } from "../config/steps";

export interface GamificationWarning {
  path: string;
  message: string;
}

/**
 * Avisos NÃO-bloqueantes, só para o Builder (spec Fase 4B item 19) — nunca
 * usado por semantic-validation.ts, que trata só o que bloqueia publish.
 * "Configuração estranha, mas não necessariamente errada": o lojista pode
 * ter uma razão real (ex.: quantidade maior com progresso menor de
 * propósito), então isto só avisa, nunca impede salvar/publicar.
 */
export function computeGamificationWarnings(rule: GamificationProgressRule, offers: OfferItem[] | null): GamificationWarning[] {
  const warnings: GamificationWarning[] = [];

  if (rule.type === "OFFER_SELECTION_PROGRESS" && offers) {
    // Ordena as ofertas pela ordem real do OFFER step (não pela ordem das
    // chaves do mapeamento) e avisa quando o progresso cai ao ir para uma
    // oferta "maior" na lista — sinal comum de mapeamento invertido.
    let previous: { offerId: string; progress: number } | null = null;
    for (const offer of offers) {
      const progress = rule.offerProgress[offer.id];
      if (progress === undefined) continue;
      if (previous && progress < previous.progress) {
        warnings.push({
          path: `progressRule.offerProgress.${offer.id}`,
          message: `Progresso da oferta "${offer.label}" (${progress}%) é menor que o da oferta anterior (${previous.progress}%).`,
        });
      }
      previous = { offerId: offer.id, progress };
    }
  }

  return warnings;
}
