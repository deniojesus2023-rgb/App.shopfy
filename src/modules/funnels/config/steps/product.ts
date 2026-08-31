import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

export const productStepConfigSchema = z
  .object({
    headline: safeText(200, { optional: true }),
    subheadline: safeText(300, { optional: true }),
    showRating: z.boolean(),
    ratingValue: z.number().min(0).max(5).optional(),
    ratingCount: z.number().int().min(0).max(1_000_000).optional(),
    showBenefits: z.boolean(),
    // Preço/variantes propositalmente fora daqui — vêm do catálogo
    // (Product/ProductVariant) e, futuramente, das regras de pricing do
    // funil. Duplicar preço no config divergiria do catálogo real.
    benefits: z.array(safeText(150)).max(10).default([]),
    showCompareAtPrice: z.boolean(),
    ctaText: safeText(60),
  })
  .refine((v) => !v.showRating || v.ratingValue !== undefined, {
    message: "ratingValue é obrigatório quando showRating está habilitado.",
    path: ["ratingValue"],
  })
  .refine((v) => !v.showBenefits || v.benefits.length > 0, {
    message: "benefits não pode ser vazio quando showBenefits está habilitado.",
    path: ["benefits"],
  });

export const productStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("PRODUCT"),
  config: productStepConfigSchema,
});

export type ProductStepConfig = z.infer<typeof productStepConfigSchema>;
export type ProductStep = z.infer<typeof productStepSchema>;
