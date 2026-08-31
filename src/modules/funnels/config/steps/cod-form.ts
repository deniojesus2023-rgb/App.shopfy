import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// Campos fechados de propósito — nenhum campo arbitrário é aceito nesta
// fase (implementação real do formulário COD é de uma fase futura).
export const COD_FIELD_KEYS = [
  "NAME",
  "PHONE",
  "WHATSAPP",
  "COUNTRY",
  "STATE",
  "CITY",
  "ADDRESS",
  "ADDRESS_REFERENCE",
] as const;

const codFieldSchema = z.object({
  key: z.enum(COD_FIELD_KEYS),
  enabled: z.boolean(),
  required: z.boolean(),
  label: safeText(60, { optional: true }),
});

export const codFormStepConfigSchema = z
  .object({
    fields: z.array(codFieldSchema).max(COD_FIELD_KEYS.length),
    submitButtonText: safeText(60),
    paymentNotice: safeText(300, { optional: true }),
  })
  .refine((v) => new Set(v.fields.map((f) => f.key)).size === v.fields.length, {
    message: "Campo do formulário COD duplicado.",
    path: ["fields"],
  });

export const codFormStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("COD_FORM"),
  config: codFormStepConfigSchema,
});

export type CodFormStepConfig = z.infer<typeof codFormStepConfigSchema>;
export type CodFormStep = z.infer<typeof codFormStepSchema>;
