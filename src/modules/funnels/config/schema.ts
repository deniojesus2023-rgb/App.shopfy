import { z } from "zod";

import { funnelThemeSchema } from "./theme";
import { funnelStepSchema, funnelStepSchemaV1 } from "./steps";

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

// V2 (atual, Fase 4A) — offers carregam `pricing` própria.
export const funnelConfigV2Schema = z.object({
  schemaVersion: z.literal(2),
  theme: funnelThemeSchema,
  steps: z.array(funnelStepSchema).min(1).max(20),
  settings: funnelSettingsSchema,
});

export type FunnelConfigV2 = z.infer<typeof funnelConfigV2Schema>;

// Alias da versão corrente — é isto que todo código fora de
// config/parse.ts e config/migrate.ts deve importar (`FunnelConfig`), já
// que `parseFunnelConfig` sempre migra e devolve este shape.
export type FunnelConfig = FunnelConfigV2;

export const CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION = 2;

export * from "./theme";
export * from "./steps";
