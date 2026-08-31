import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

export const successStepConfigSchema = z.object({
  title: safeText(150),
  subtitle: safeText(300, { optional: true }),
  showOrderNumber: z.boolean(),
  showRewardProgress: z.boolean(),
  ctaText: safeText(60, { optional: true }),
});

export const successStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("SUCCESS"),
  config: successStepConfigSchema,
});

export type SuccessStepConfig = z.infer<typeof successStepConfigSchema>;
export type SuccessStep = z.infer<typeof successStepSchema>;
