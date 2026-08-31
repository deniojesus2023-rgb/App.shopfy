import { z } from "zod";

import { pricingRuleSchema } from "../pricing-rule";
import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// ---------------------------------------------------------------------------
// V1 (legado) — sem `pricing`. Existe só para validar/ler config já
// publicado antes da Fase 4A; `parseFunnelConfig` migra para V2 em memória
// (UNIT_MULTIPLIER implícito) e nenhum código novo deve importar isto.
// ---------------------------------------------------------------------------
const offerItemSchemaV1 = z.object({
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(20),
  label: safeText(120),
  badge: safeText(40, { optional: true }),
});

export const offerStepConfigSchemaV1 = z
  .object({
    offers: z.array(offerItemSchemaV1).min(1).max(6),
  })
  .refine((v) => new Set(v.offers.map((o) => o.id)).size === v.offers.length, {
    message: "IDs de oferta duplicados.",
    path: ["offers"],
  })
  .refine((v) => new Set(v.offers.map((o) => o.quantity)).size === v.offers.length, {
    message: "Quantidades de oferta duplicadas.",
    path: ["offers"],
  });

export const offerStepSchemaV1 = funnelStepBaseSchema.extend({
  type: z.literal("OFFER"),
  config: offerStepConfigSchemaV1,
});

export type OfferStepConfigV1 = z.infer<typeof offerStepConfigSchemaV1>;

// ---------------------------------------------------------------------------
// V2 (atual, Fase 4A) — cada oferta carrega sua própria regra comercial.
// ---------------------------------------------------------------------------
const offerItemSchema = z.object({
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(20),
  label: safeText(120),
  badge: safeText(40, { optional: true }),
  pricing: pricingRuleSchema,
});

export const offerStepConfigSchema = z
  .object({
    offers: z.array(offerItemSchema).min(1).max(6),
    // Só alimenta o preço mostrado no PRODUCT step antes do visitante
    // chegar em OFFER — nunca pré-seleciona um rádio no próprio OFFER
    // step nem dispensa escolha explícita na submissão (ver
    // modules/orders/service.ts). Ausente = comportamento anterior à
    // Fase 4A (mostra o preço cru do snapshot).
    defaultOfferId: z.string().max(64).optional(),
  })
  .refine((v) => new Set(v.offers.map((o) => o.id)).size === v.offers.length, {
    message: "IDs de oferta duplicados.",
    path: ["offers"],
  })
  .refine((v) => new Set(v.offers.map((o) => o.quantity)).size === v.offers.length, {
    message: "Quantidades de oferta duplicadas.",
    path: ["offers"],
  })
  .refine((v) => !v.defaultOfferId || v.offers.some((o) => o.id === v.defaultOfferId), {
    message: "defaultOfferId precisa referenciar uma oferta existente.",
    path: ["defaultOfferId"],
  });

export const offerStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("OFFER"),
  config: offerStepConfigSchema,
});

export type OfferItem = z.infer<typeof offerItemSchema>;
export type OfferStepConfig = z.infer<typeof offerStepConfigSchema>;
export type OfferStep = z.infer<typeof offerStepSchema>;
