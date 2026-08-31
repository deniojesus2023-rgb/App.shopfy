import "server-only";

import { Prisma, type ShopifyProductStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/modules/shared/errors";
import type { ProductUpsertData, VariantUpsertData } from "./transform";

/**
 * Upsert de um produto e do conjunto completo de suas variantes, numa
 * transação por produto (não por loja inteira — mantém locks curtos mesmo
 * numa loja com milhares de produtos, já que cada job processa uma página
 * e cada produto da página é sua própria transação).
 *
 * Como a página do GraphQL sempre traz TODAS as variantes do produto
 * (limite da Shopify é 100/produto, pedimos `first: 100`), o conjunto
 * recebido aqui é autoritativo para este produto: qualquer variante local
 * que não esteja mais presente é soft-deletada nesta mesma chamada — não
 * depende do marcador de sync run (que só serve para produtos sumidos da
 * paginação inteira, não para variantes de um produto que já temos).
 */
export async function upsertProductWithVariants(params: {
  workspaceId: string;
  shopifyStoreId: string;
  product: ProductUpsertData;
  variants: VariantUpsertData[];
  syncRunId?: string;
}): Promise<{ productId: string; variantCount: number }> {
  const { workspaceId, shopifyStoreId, product, variants, syncRunId } = params;

  return prisma.$transaction(async (tx) => {
    const productRow = await tx.product.upsert({
      where: {
        shopifyStoreId_shopifyProductId: { shopifyStoreId, shopifyProductId: product.shopifyProductId },
      },
      create: {
        workspaceId,
        shopifyStoreId,
        shopifyProductId: product.shopifyProductId,
        title: product.title,
        handle: product.handle,
        description: product.description,
        descriptionHtml: product.descriptionHtml,
        vendor: product.vendor,
        productType: product.productType,
        status: product.status as ShopifyProductStatus,
        featuredImageUrl: product.featuredImageUrl,
        shopifyCreatedAt: product.shopifyCreatedAt,
        shopifyUpdatedAt: product.shopifyUpdatedAt,
        syncedAt: new Date(),
        lastSeenSyncRunId: syncRunId,
        deletedAt: null,
      },
      update: {
        title: product.title,
        handle: product.handle,
        description: product.description,
        descriptionHtml: product.descriptionHtml,
        vendor: product.vendor,
        productType: product.productType,
        status: product.status as ShopifyProductStatus,
        featuredImageUrl: product.featuredImageUrl,
        shopifyCreatedAt: product.shopifyCreatedAt,
        shopifyUpdatedAt: product.shopifyUpdatedAt,
        syncedAt: new Date(),
        ...(syncRunId ? { lastSeenSyncRunId: syncRunId } : {}),
        deletedAt: null,
      },
    });

    const incomingVariantIds = variants.map((v) => v.shopifyVariantId);

    // `notIn: []` no Prisma corresponde a "sem restrição" (equivalente a
    // omitir o filtro), não a "nada bate" — por isso o `where` condicional:
    // se a página não trouxe nenhuma variante, TODAS as locais devem ser
    // soft-deletadas, não nenhuma.
    await tx.productVariant.updateMany({
      where: {
        productId: productRow.id,
        deletedAt: null,
        ...(incomingVariantIds.length > 0 ? { shopifyVariantId: { notIn: incomingVariantIds } } : {}),
      },
      data: { deletedAt: new Date() },
    });

    for (const variant of variants) {
      await tx.productVariant.upsert({
        where: {
          shopifyStoreId_shopifyVariantId: { shopifyStoreId, shopifyVariantId: variant.shopifyVariantId },
        },
        create: {
          workspaceId,
          productId: productRow.id,
          shopifyStoreId,
          shopifyVariantId: variant.shopifyVariantId,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price: new Prisma.Decimal(variant.price),
          compareAtPrice: variant.compareAtPrice ? new Prisma.Decimal(variant.compareAtPrice) : null,
          inventoryQuantity: variant.inventoryQuantity,
          availableForSale: variant.availableForSale,
          position: variant.position,
          imageUrl: variant.imageUrl,
          shopifyCreatedAt: variant.shopifyCreatedAt,
          shopifyUpdatedAt: variant.shopifyUpdatedAt,
          deletedAt: null,
        },
        update: {
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          price: new Prisma.Decimal(variant.price),
          compareAtPrice: variant.compareAtPrice ? new Prisma.Decimal(variant.compareAtPrice) : null,
          inventoryQuantity: variant.inventoryQuantity,
          availableForSale: variant.availableForSale,
          position: variant.position,
          imageUrl: variant.imageUrl,
          shopifyCreatedAt: variant.shopifyCreatedAt,
          shopifyUpdatedAt: variant.shopifyUpdatedAt,
          deletedAt: null,
        },
      });
    }

    return { productId: productRow.id, variantCount: variants.length };
  });
}

export async function softDeleteProductByShopifyId(
  shopifyStoreId: string,
  shopifyProductId: string
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { shopifyStoreId_shopifyProductId: { shopifyStoreId, shopifyProductId } },
  });
  if (!product || product.deletedAt) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.product.update({ where: { id: product.id }, data: { deletedAt: now } }),
    prisma.productVariant.updateMany({
      where: { productId: product.id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
}

/**
 * Reconciliação: só deve ser chamada depois que um CatalogSyncRun FULL
 * chegou em COMPLETED (ver modules/catalog/sync-run.ts). Qualquer produto
 * da loja cujo `lastSeenSyncRunId` não é o run atual não apareceu na
 * paginação completa — foi removido na Shopify.
 */
export async function reconcileProductsNotSeenInRun(params: {
  shopifyStoreId: string;
  syncRunId: string;
}): Promise<number> {
  const now = new Date();

  const missing = await prisma.product.findMany({
    where: {
      shopifyStoreId: params.shopifyStoreId,
      deletedAt: null,
      lastSeenSyncRunId: { not: params.syncRunId },
    },
    select: { id: true },
  });

  if (missing.length === 0) return 0;

  const productIds = missing.map((p) => p.id);
  await prisma.$transaction([
    prisma.product.updateMany({ where: { id: { in: productIds } }, data: { deletedAt: now } }),
    prisma.productVariant.updateMany({
      where: { productId: { in: productIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  return productIds.length;
}

// ---------------------------------------------------------------------------
// Listagem paginada (UI)
// ---------------------------------------------------------------------------

export type ProductStatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";

export interface ListProductsParams {
  workspaceId: string;
  shopifyStoreId: string;
  status?: ProductStatusFilter;
  search?: string;
  cursor?: string;
  pageSize?: number;
}

export interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: ShopifyProductStatus;
  featuredImageUrl: string | null;
  shopifyUpdatedAt: Date | null;
  syncedAt: Date;
  variantCount: number;
  startingPrice: string | null;
  totalInventory: number | null;
}

export interface ListProductsResult {
  items: ProductListItem[];
  nextCursor: string | null;
}

/**
 * Paginação cursor-based sobre o nosso próprio banco (nunca carrega o
 * catálogo inteiro na UI). Busca e filtro de status acontecem no banco via
 * `where`, não em memória.
 */
export async function listProducts(params: ListProductsParams): Promise<ListProductsResult> {
  const pageSize = params.pageSize ?? 24;

  const where: Prisma.ProductWhereInput = {
    workspaceId: params.workspaceId,
    shopifyStoreId: params.shopifyStoreId,
    deletedAt: null,
    ...(params.status && params.status !== "ALL" ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search, mode: "insensitive" } },
            { variants: { some: { sku: { contains: params.search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.product.findMany({
    where,
    orderBy: { id: "asc" },
    take: pageSize + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: {
      variants: {
        where: { deletedAt: null },
        select: { price: true, inventoryQuantity: true },
      },
    },
  });

  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;

  const items: ProductListItem[] = page.map((p) => {
    const prices = p.variants.map((v) => v.price);
    const startingPrice = prices.length > 0 ? prices.reduce((a, b) => (a.lt(b) ? a : b)).toString() : null;
    const totalInventory = p.variants.some((v) => v.inventoryQuantity != null)
      ? p.variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0)
      : null;

    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      featuredImageUrl: p.featuredImageUrl,
      shopifyUpdatedAt: p.shopifyUpdatedAt,
      syncedAt: p.syncedAt,
      variantCount: p.variants.length,
      startingPrice,
      totalInventory,
    };
  });

  return { items, nextCursor: hasNextPage ? page[page.length - 1].id : null };
}

export async function getShopifyStoreForWorkspace(workspaceId: string, storeId: string) {
  const store = await prisma.shopifyStore.findFirst({ where: { id: storeId, workspaceId } });
  if (!store) {
    throw new NotFoundError("Loja não encontrada.");
  }
  return store;
}
