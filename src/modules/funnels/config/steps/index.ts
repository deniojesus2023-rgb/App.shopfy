import { z } from "zod";

import { codFormStepSchema } from "./cod-form";
import { offerStepSchema, offerStepSchemaV1 } from "./offer";
import { paymentChoiceStepSchema, paymentChoiceStepSchemaV3 } from "./payment-choice";
import { productStepSchema } from "./product";
import { rewardStepSchema, rewardStepSchemaV2 } from "./reward";
import { successStepSchema } from "./success";
import { upsellStepSchema } from "./upsell";

// União de steps da versão ATUAL do config (V4, Fase 4C) — é o que todo
// código fora de config/parse.ts e config/migrate.ts deve importar como
// "FunnelStep": builder, storefront, semantic-validation, etc. sempre
// operam sobre config já migrado em memória.
export const funnelStepSchema = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchema,
  offerStepSchema,
  paymentChoiceStepSchema,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export type FunnelStep = z.infer<typeof funnelStepSchema>;
export type FunnelStepType = FunnelStep["type"];

// União V1 (legado) — OFFER sem `pricing`, REWARD sem regra real,
// PAYMENT_CHOICE sem paymentMethods (o shape de PAYMENT_CHOICE nunca mudou
// entre V1/V2/V3 — só ganhou paymentMethods na Fase 4C). Usado
// exclusivamente por config/schema.ts (funnelConfigV1Schema) para validar
// config histórico antes da migração — nunca importar fora dali.
export const funnelStepSchemaV1 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchemaV2,
  offerStepSchemaV1,
  paymentChoiceStepSchemaV3,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

// União V2 (legado, Fase 4A) — OFFER já com `pricing` (não mudou na Fase
// 4B/4C), REWARD ainda no shape antigo, PAYMENT_CHOICE ainda no shape
// antigo. Usado exclusivamente por config/schema.ts (funnelConfigV2Schema)
// para validar config publicado entre a Fase 4A e a Fase 4B — nunca
// importar fora dali.
export const funnelStepSchemaV2 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchemaV2,
  offerStepSchema,
  paymentChoiceStepSchemaV3,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export type FunnelStepV2 = z.infer<typeof funnelStepSchemaV2>;

// União V3 (legado, Fase 4B) — REWARD já com regra real (não mudou na
// Fase 4C), PAYMENT_CHOICE ainda no shape antigo (allowCod/
// allowOnlinePayment). Usado exclusivamente por config/schema.ts
// (funnelConfigV3Schema) para validar config publicado entre a Fase 4B e a
// Fase 4C — nunca importar fora dali.
export const funnelStepSchemaV3 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchema,
  offerStepSchema,
  paymentChoiceStepSchemaV3,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export type FunnelStepV3 = z.infer<typeof funnelStepSchemaV3>;

export * from "./cod-form";
export * from "./offer";
export * from "./payment-choice";
export * from "./product";
export * from "./reward";
export * from "./success";
export * from "./upsell";
