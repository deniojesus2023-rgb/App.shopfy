import { z } from "zod";

// Payload validado por Zod por tipo de job — nunca confiar em um payload
// JSON solto vindo do banco sem checar o formato antes de processar.

export const shopifyFullCatalogSyncPayloadSchema = z.object({
  workspaceId: z.string().cuid(),
  shopifyStoreId: z.string().cuid(),
  syncRunId: z.string().cuid(),
  // Ausente na primeira página; presente nas páginas de continuação.
  cursor: z.string().nullable().optional(),
});
export type ShopifyFullCatalogSyncPayload = z.infer<
  typeof shopifyFullCatalogSyncPayloadSchema
>;

export const shopifyProductSyncPayloadSchema = z.object({
  workspaceId: z.string().cuid(),
  shopifyStoreId: z.string().cuid(),
  shopifyProductId: z.string().min(1),
});
export type ShopifyProductSyncPayload = z.infer<typeof shopifyProductSyncPayloadSchema>;

export const shopifyProductDeletePayloadSchema = z.object({
  workspaceId: z.string().cuid(),
  shopifyStoreId: z.string().cuid(),
  shopifyProductId: z.string().min(1),
});
export type ShopifyProductDeletePayload = z.infer<
  typeof shopifyProductDeletePayloadSchema
>;

// Payload minimalista de propósito (spec Fase 3, item 17): só o id interno
// do Order. Nunca copiar nome/telefone/endereço para cá — o worker carrega
// o CodLead do banco quando precisar, então esses dados nunca passam pela
// fila (que grava tudo em BackgroundJob.payload, uma coluna Json comum).
export const shopifyOrderCreatePayloadSchema = z.object({
  orderId: z.string().cuid(),
});
export type ShopifyOrderCreatePayload = z.infer<typeof shopifyOrderCreatePayloadSchema>;

export const JOB_PAYLOAD_SCHEMAS = {
  SHOPIFY_FULL_CATALOG_SYNC: shopifyFullCatalogSyncPayloadSchema,
  SHOPIFY_PRODUCT_SYNC: shopifyProductSyncPayloadSchema,
  SHOPIFY_PRODUCT_DELETE: shopifyProductDeletePayloadSchema,
  SHOPIFY_ORDER_CREATE: shopifyOrderCreatePayloadSchema,
} as const;

export type BackgroundJobTypeName = keyof typeof JOB_PAYLOAD_SCHEMAS;
