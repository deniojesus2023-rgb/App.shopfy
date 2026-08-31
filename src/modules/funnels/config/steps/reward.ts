import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// Configuração de apresentação apenas — elegibilidade/lógica real de
// recompensa é da fase de gamificação.
export const rewardStepConfigSchema = z.object({
  title: safeText(150),
  subtitle: safeText(300, { optional: true }),
  rewardDisplayType: z.enum(["CURRENCY", "PERCENTAGE", "GENERIC"]),
  displayValue: safeText(50),
  initialProgress: z.number().min(0).max(100),
  ctaText: safeText(60),
});

export const rewardStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("REWARD"),
  config: rewardStepConfigSchema,
});

export type RewardStepConfig = z.infer<typeof rewardStepConfigSchema>;
export type RewardStep = z.infer<typeof rewardStepSchema>;
