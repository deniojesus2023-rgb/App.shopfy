import { z } from "zod";

import { funnelThemeSchema } from "./theme";
import { funnelStepSchema, funnelStepSchemaV1, funnelStepSchemaV2 } from "./steps";

// Placeholder deliberadamente mínimo — cresce em fases futuras (analytics,
// idioma, moeda). Fechado (não `.passthrough()`): nenhuma chave arbitrária.
const funnelSettingsSchema = z
  .object({
    locale: z.string().max(10).optional(),
  })
  .strict();

// V1 (legado) — só para validar/ler config publicado antes da Fase 4A.
// Nunca usado fora de config/parse.ts. Uma FunnelVersion PUBLISHED antiga
// continua com este shape no banco para sempre — nunca reescrita.
export const funnelConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  theme: funnelThemeSchema,
  steps: z.array(funnelStepSchemaV1).min(1).max(20),
  settings: funnelSettingsSchema,
});

export type FunnelConfigV1 = z.infer<typeof funnelConfigV1Schema>;

// V2 (legado, Fase 4A) — offers já carregam `pricing` própria, mas REWARD
// ainda é texto/número digitado, sem regra real. Nunca usado fora de
// config/parse.ts — uma FunnelVersion PUBLISHED entre a Fase 4A e a Fase
// 4B continua com este shape no banco para sempre — nunca reescrita.
export const funnelConfigV2Schema = z.object({
  schemaVersion: z.literal(2),
  theme: funnelThemeSchema,
  steps: z.array(funnelStepSchemaV2).min(1).max(20),
  settings: funnelSettingsSchema,
});

export type FunnelConfigV2 = z.infer<typeof funnelConfigV2Schema>;

// V3 (atual, Fase 4B) — REWARD carrega uma regra real de progresso
// (GamificationProgressRule) e uma recompensa tipada, avaliadas por
// evaluateGamification() — nunca mais um percentual/valor digitado.
export const funnelConfigV3Schema = z.object({
  schemaVersion: z.literal(3),
  theme: funnelThemeSchema,
  steps: z.array(funnelStepSchema).min(1).max(20),
  settings: funnelSettingsSchema,
});

export type FunnelConfigV3 = z.infer<typeof funnelConfigV3Schema>;

// Alias da versão corrente — é isto que todo código fora de
// config/parse.ts e config/migrate.ts deve importar (`FunnelConfig`), já
// que `parseFunnelConfig` sempre migra e devolve este shape.
export type FunnelConfig = FunnelConfigV3;

export const CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION = 3;

export * from "./theme";
export * from "./steps";
