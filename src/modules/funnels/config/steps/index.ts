import { z } from "zod";

import { codFormStepSchema } from "./cod-form";
import { offerStepSchema, offerStepSchemaV1 } from "./offer";
import { paymentChoiceStepSchema } from "./payment-choice";
import { productStepSchema } from "./product";
import { rewardStepSchema, rewardStepSchemaV2 } from "./reward";
import { successStepSchema } from "./success";
import { upsellStepSchema } from "./upsell";

// União de steps da versão ATUAL do config (V3, Fase 4B) — é o que todo
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

// União V1 (legado) — OFFER sem `pricing` e REWARD sem regra real (o
// shape de REWARD nunca mudou entre V1 e V2 — só ganhou regra na Fase 4B).
// Usado exclusivamente por config/schema.ts (funnelConfigV1Schema) para
// validar config histórico antes da migração — nunca importar fora dali.
export const funnelStepSchemaV1 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchemaV2,
  offerStepSchemaV1,
  paymentChoiceStepSchema,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

// União V2 (legado, Fase 4A) — OFFER já com `pricing` (não mudou na Fase
// 4B), REWARD ainda no shape antigo (texto livre, sem regra). Usado
// exclusivamente por config/schema.ts (funnelConfigV2Schema) para validar
// config publicado entre a Fase 4A e a Fase 4B — nunca importar fora dali.
export const funnelStepSchemaV2 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchemaV2,
  offerStepSchema,
  paymentChoiceStepSchema,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export type FunnelStepV2 = z.infer<typeof funnelStepSchemaV2>;

export * from "./cod-form";
export * from "./offer";
export * from "./payment-choice";
export * from "./product";
export * from "./reward";
export * from "./success";
export * from "./upsell";
