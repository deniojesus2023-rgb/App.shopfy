import "server-only";

import { prisma } from "@/lib/db";
import { NonRetryableJobError } from "@/modules/queue/errors";
import type { ShopifyProductSyncPayload } from "@/modules/queue/types";
import { ShopifyAuthError, createShopifyGraphqlClient } from "@/modules/shopify/client";
import { getDecryptedAccessToken } from "@/modules/shopify/stores/service";
import { SINGLE_PRODUCT_QUERY, type SingleProductResponse } from "../graphql";
import { softDeleteProductByShopifyId, upsertProductWithVariants } from "../service";
import { transformProductNode, transformVariantNodes } from "../transform";

/**
 * Disparado por `products/update`. Nunca confia no payload do webhook como
 * fonte canônica (pode estar parcial, atrasado, ou duplicado) — sempre
 * busca o estado atual do produto direto na Shopify e faz upsert dele.
 */
export async function processProductSyncJob(payload: ShopifyProductSyncPayload): Promise<void> {
  const store = await prisma.shopifyStore.findFirst({
    where: { id: payload.shopifyStoreId, workspaceId: payload.workspaceId },
  });
  if (!store || store.status !== "CONNECTED") {
    throw new NonRetryableJobError("Loja não encontrada ou não conectada.");
  }

  let accessToken: string;
  try {
    accessToken = await getDecryptedAccessToken(payload.workspaceId, payload.shopifyStoreId);
  } catch {
    throw new NonRetryableJobError("Token indisponível.");
  }

  const client = createShopifyGraphqlClient(store.shopDomain, accessToken);

  let response: SingleProductResponse;
  try {
    response = await client.request<SingleProductResponse>(SINGLE_PRODUCT_QUERY, {
      id: payload.shopifyProductId,
    });
  } catch (error) {
    if (error instanceof ShopifyAuthError) {
      await prisma.shopifyStore.update({ where: { id: store.id }, data: { status: "REAUTH_REQUIRED" } });
      throw new NonRetryableJobError("Reautorização necessária.");
    }
    throw error;
  }

  if (!response.product) {
    // Produto sumiu entre o webhook e a consulta (ex.: excluído logo em
    // seguida) — trata como remoção, não como erro.
    await softDeleteProductByShopifyId(payload.shopifyStoreId, payload.shopifyProductId);
    return;
  }

  await upsertProductWithVariants({
    workspaceId: payload.workspaceId,
    shopifyStoreId: payload.shopifyStoreId,
    product: transformProductNode(response.product),
    variants: transformVariantNodes(response.product.variants.edges),
  });
}
