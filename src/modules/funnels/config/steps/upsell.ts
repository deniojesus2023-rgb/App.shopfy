import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// Apenas configuração/apresentação — o fluxo de aceitar/recusar upsell é
// implementado numa fase futura.
export const upsellStepConfigSchema = z.object({
  headline: safeText(200),
  subheadline: safeText(300, { optional: true }),
  productRole: z.literal("UPSELL"),
  ctaText: safeText(60),
  declineText: safeText(60),
});

export const upsellStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("UPSELL"),
  config: upsellStepConfigSchema,
});

export type UpsellStepConfig = z.infer<typeof upsellStepConfigSchema>;
export type UpsellStep = z.infer<typeof upsellStepSchema>;
