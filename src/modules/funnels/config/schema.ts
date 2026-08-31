import { z } from "zod";

import { funnelThemeSchema } from "./theme";
import { funnelStepSchema } from "./steps";

// Placeholder deliberadamente mínimo — cresce em fases futuras (analytics,
// idioma, moeda). Fechado (não `.passthrough()`): nenhuma chave arbitrária.
const funnelSettingsSchema = z
  .object({
    locale: z.string().max(10).optional(),
  })
  .strict();

export const funnelConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  theme: funnelThemeSchema,
  steps: z.array(funnelStepSchema).min(1).max(20),
  settings: funnelSettingsSchema,
});

export type FunnelConfigV1 = z.infer<typeof funnelConfigV1Schema>;

export const CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION = 1;

export * from "./theme";
export * from "./steps";
