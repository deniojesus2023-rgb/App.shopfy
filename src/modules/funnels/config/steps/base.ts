import { z } from "zod";

// Envelope comum a toda etapa. `id` é a identidade estável usada por regras
// de negócio futuras (analytics, deep link) — nunca reaproveitar entre
// etapas diferentes (checado em semantic-validation.ts).
export const funnelStepBaseSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(50),
});

export type FunnelStepBase = z.infer<typeof funnelStepBaseSchema>;
