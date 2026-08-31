import "server-only";

import { prisma } from "@/lib/db";
import { NonRetryableJobError } from "@/modules/queue/errors";
import { enqueueJob } from "@/modules/queue/service";
import type { ShopifyFullCatalogSyncPayload } from "@/modules/queue/types";
import { ShopifyAuthError } from "@/modules/shopify/client";
import { createShopifyGraphqlClient } from "@/modules/shopify/client";
import { getDecryptedAccessToken } from "@/modules/shopify/stores/service";
import { ensureRequiredWebhooks } from "@/modules/shopify/webhooks/register";
import { CATALOG_PAGE_QUERY, type CatalogPageResponse } from "../graphql";
import { upsertProductWithVariants, reconcileProductsNotSeenInRun } from "../service";
import { completeSyncRun, failSyncRun, incrementSyncRunCounters, markSyncRunRunning } from "../sync-run";
import { transformProductNode, transformVariantNodes } from "../transform";

const PAGE_SIZE = 50;
// Se a Shopify sinalizar pouca capacidade restante de custo, a próxima
// página é reagendada (não processada na hora) — evita loop agressivo
// contra o rate limit da Admin API.
const THROTTLE_SAFETY_MARGIN = 100;
const THROTTLE_BACKOFF_MS = 3000;

export async function processFullCatalogSyncJob(
  payload: ShopifyFullCatalogSyncPayload
): Promise<void> {
  const store = await prisma.shopifyStore.findFirst({
    where: { id: payload.shopifyStoreId, workspaceId: payload.workspaceId },
  });

  if (!store) {
    await failSyncRun(payload.syncRunId, "Loja não encontrada (pode ter sido desconectada).");
    throw new NonRetryableJobError("ShopifyStore não encontrada.");
  }
  if (store.status !== "CONNECTED") {
    await failSyncRun(payload.syncRunId, `Loja não está conectada (status: ${store.status}).`);
    throw new NonRetryableJobError(`Loja com status ${store.status}, sync abortado.`);
  }

  const isFirstPage = !payload.cursor;

  let accessToken: string;
  try {
    accessToken = await getDecryptedAccessToken(payload.workspaceId, payload.shopifyStoreId);
  } catch {
    await failSyncRun(payload.syncRunId, "Não foi possível obter o access token da loja.");
    throw new NonRetryableJobError("Token indisponível.");
  }

  if (isFirstPage) {
    await markSyncRunRunning(payload.syncRunId);
    // Melhor esforço: uma loja conectada antes desta fase pode não ter os
    // webhooks mais novos (ex.: products/delete) registrados ainda.
    await ensureRequiredWebhooks(store.shopDomain, accessToken).catch(() => undefined);
  }

  const client = createShopifyGraphqlClient(store.shopDomain, accessToken);

  let page;
  try {
    page = await client.requestWithMeta<CatalogPageResponse>(CATALOG_PAGE_QUERY, {
      first: PAGE_SIZE,
      after: payload.cursor ?? null,
    });
  } catch (error) {
    if (error instanceof ShopifyAuthError) {
      await prisma.shopifyStore.update({
        where: { id: store.id },
        data: { status: "REAUTH_REQUIRED" },
      });
      await failSyncRun(payload.syncRunId, "Token da Shopify inválido/revogado.");
      throw new NonRetryableJobError("Reautorização necessária.");
    }
    throw error; // throttled / erro transitório → deixa a fila retentar com backoff
  }

  let productsProcessed = 0;
  let variantsProcessed = 0;

  for (const edge of page.data.products.edges) {
    const productData = transformProductNode(edge.node);
    const variantsData = transformVariantNodes(edge.node.variants.edges);

    const result = await upsertProductWithVariants({
      workspaceId: payload.workspaceId,
      shopifyStoreId: payload.shopifyStoreId,
      product: productData,
      variants: variantsData,
      syncRunId: payload.syncRunId,
    });

    productsProcessed += 1;
    variantsProcessed += result.variantCount;
  }

  await incrementSyncRunCounters(payload.syncRunId, {
    products: productsProcessed,
    variants: variantsProcessed,
  });

  const { hasNextPage, endCursor } = page.data.products.pageInfo;

  if (hasNextPage && endCursor) {
    const lowOnBudget =
      page.throttleStatus != null && page.throttleStatus.currentlyAvailable < THROTTLE_SAFETY_MARGIN;

    await enqueueJob({
      type: "SHOPIFY_FULL_CATALOG_SYNC",
      workspaceId: payload.workspaceId,
      payload: { ...payload, cursor: endCursor },
      runAt: lowOnBudget ? new Date(Date.now() + THROTTLE_BACKOFF_MS) : undefined,
    });
    return;
  }

  // Última página processada com sucesso: só agora é seguro reconciliar
  // (produtos que sumiram da paginação completa = removidos na Shopify).
  await reconcileProductsNotSeenInRun({
    shopifyStoreId: payload.shopifyStoreId,
    syncRunId: payload.syncRunId,
  });
  await completeSyncRun(payload.syncRunId);
  await prisma.shopifyStore.update({ where: { id: store.id }, data: { lastSyncAt: new Date() } });
}
