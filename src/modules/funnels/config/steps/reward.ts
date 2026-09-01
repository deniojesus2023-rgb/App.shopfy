import { z } from "zod";

import {
  gamificationMilestoneSchema,
  gamificationProgressRuleSchema,
  gamificationRewardSchema,
  MAX_GAMIFICATION_MILESTONES,
} from "../gamification";
import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// ---------------------------------------------------------------------------
// V2 (legado) — presentation-only: `displayValue` era texto livre digitado
// pelo lojista, sem nenhuma regra real por trás (o comentário que existia
// no editor já admitia isso: "las reglas reales se configurarán
// posteriormente"). Existe só para validar/ler config publicado antes da
// Fase 4B; `parseFunnelConfig` migra para V3 em memória. Nenhum código novo
// deve importar isto fora de config/parse.ts e config/migrate.ts.
// ---------------------------------------------------------------------------
export const rewardStepConfigSchemaV2 = z.object({
  title: safeText(150),
  subtitle: safeText(300, { optional: true }),
  rewardDisplayType: z.enum(["CURRENCY", "PERCENTAGE", "GENERIC"]),
  displayValue: safeText(50),
  initialProgress: z.number().min(0).max(100),
  ctaText: safeText(60),
});

export const rewardStepSchemaV2 = funnelStepBaseSchema.extend({
  type: z.literal("REWARD"),
  config: rewardStepConfigSchemaV2,
});

export type RewardStepConfigV2 = z.infer<typeof rewardStepConfigSchemaV2>;

// ---------------------------------------------------------------------------
// V3 (atual, Fase 4B) — progresso e recompensa deixam de ser texto/número
// digitado e passam a ser resultado de uma regra real, avaliada por
// `evaluateGamification()` (modules/funnels/gamification/evaluate.ts).
// Nenhum percentual/valor é digitado aqui — só a REGRA que o produz.
// ---------------------------------------------------------------------------
export const rewardStepConfigSchema = z
  .object({
    title: safeText(150),
    subtitle: safeText(300, { optional: true }),
    progressRule: gamificationProgressRuleSchema,
    reward: gamificationRewardSchema,
    milestones: z.array(gamificationMilestoneSchema).max(MAX_GAMIFICATION_MILESTONES),
    showProgressBar: z.boolean(),
    showRemainingValue: z.boolean(),
    showCurrentValue: z.boolean(),
    ctaText: safeText(60),
    // Mostrado só quando o estado é COMPLETED (pedido local confirmado de
    // verdade — nunca por progresso matemático ter chegado a 100).
    finalMessage: safeText(200),
  })
  .refine(
    (v) => v.progressRule.type !== "OFFER_SELECTION_PROGRESS" || Object.keys(v.progressRule.offerProgress).length > 0,
    { message: "OFFER_SELECTION_PROGRESS precisa mapear ao menos uma oferta.", path: ["progressRule", "offerProgress"] }
  );

export const rewardStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("REWARD"),
  config: rewardStepConfigSchema,
});

export type RewardStepConfig = z.infer<typeof rewardStepConfigSchema>;
export type RewardStep = z.infer<typeof rewardStepSchema>;
