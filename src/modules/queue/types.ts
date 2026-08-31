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

export const JOB_PAYLOAD_SCHEMAS = {
  SHOPIFY_FULL_CATALOG_SYNC: shopifyFullCatalogSyncPayloadSchema,
  SHOPIFY_PRODUCT_SYNC: shopifyProductSyncPayloadSchema,
  SHOPIFY_PRODUCT_DELETE: shopifyProductDeletePayloadSchema,
} as const;

export type BackgroundJobTypeName = keyof typeof JOB_PAYLOAD_SCHEMAS;
