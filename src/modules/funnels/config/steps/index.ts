import { z } from "zod";

import { codFormStepSchema } from "./cod-form";
import { offerStepSchema, offerStepSchemaV1 } from "./offer";
import { paymentChoiceStepSchema } from "./payment-choice";
import { productStepSchema } from "./product";
import { rewardStepSchema } from "./reward";
import { successStepSchema } from "./success";
import { upsellStepSchema } from "./upsell";

// União de steps da versão ATUAL do config (V2, Fase 4A) — é o que todo
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

// União V1 (legado) — só os outros 6 tipos são idênticos entre V1/V2;
// OFFER é o único que difere (sem `pricing`). Usado exclusivamente por
// config/schema.ts (funnelConfigV1Schema) para validar config histórico
// antes da migração — nunca importar isto fora dali.
export const funnelStepSchemaV1 = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchema,
  offerStepSchemaV1,
  paymentChoiceStepSchema,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export * from "./cod-form";
export * from "./offer";
export * from "./payment-choice";
export * from "./product";
export * from "./reward";
export * from "./success";
export * from "./upsell";
