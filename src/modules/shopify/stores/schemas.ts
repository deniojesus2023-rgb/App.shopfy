import { z } from "zod";

export const connectStoreSchema = z.object({
  shopDomainInput: z
    .string()
    .trim()
    .min(1, "Informe o domínio da loja.")
    .max(200, "Domínio muito longo."),
});

export const disconnectStoreSchema = z.object({
  storeId: z.string().cuid(),
});
