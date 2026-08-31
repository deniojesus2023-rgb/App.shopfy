import { z } from "zod";

export const createFunnelSchema = z.object({
  shopifyStoreId: z.string().cuid(),
  productId: z.string().cuid(),
  templateKey: z.string().min(1).max(80),
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres.").max(120),
  slug: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const updateDraftConfigSchema = z.object({
  versionId: z.string().cuid(),
  expectedRevision: z.coerce.number().int().min(0),
  // O conteúdo em si é validado por parseFunnelConfig (Zod da FunnelConfigV1)
  // dentro do service — aqui só garantimos que chegou um JSON parseável.
  configJson: z.string().min(1).max(50_000, "Configuração excede o tamanho máximo permitido."),
});

export const publishFunnelSchema = z.object({
  funnelId: z.string().cuid(),
});

export const archiveFunnelSchema = z.object({
  funnelId: z.string().cuid(),
});
