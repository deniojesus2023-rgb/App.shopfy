import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// Sem preço fictício aqui de propósito — cada oferta referencia uma
// quantidade; o preço será calculado por regras de pricing (engine futura),
// nunca hardcoded no config do funil.
const offerItemSchema = z.object({
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(20),
  label: safeText(120),
  badge: safeText(40, { optional: true }),
});

export const offerStepConfigSchema = z
  .object({
    offers: z.array(offerItemSchema).min(1).max(6),
  })
  .refine(
    (v) => new Set(v.offers.map((o) => o.id)).size === v.offers.length,
    { message: "IDs de oferta duplicados.", path: ["offers"] }
  )
  .refine(
    (v) => new Set(v.offers.map((o) => o.quantity)).size === v.offers.length,
    { message: "Quantidades de oferta duplicadas.", path: ["offers"] }
  );

export const offerStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("OFFER"),
  config: offerStepConfigSchema,
});

export type OfferStepConfig = z.infer<typeof offerStepConfigSchema>;
export type OfferStep = z.infer<typeof offerStepSchema>;
