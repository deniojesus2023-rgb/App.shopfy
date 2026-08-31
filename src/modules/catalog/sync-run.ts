import "server-only";

import { prisma } from "@/lib/db";
import type { CatalogSyncType } from "@prisma/client";

export async function createSyncRun(params: {
  workspaceId: string;
  shopifyStoreId: string;
  type: CatalogSyncType;
}) {
  return prisma.catalogSyncRun.create({
    data: {
      workspaceId: params.workspaceId,
      shopifyStoreId: params.shopifyStoreId,
      type: params.type,
      status: "PENDING",
    },
  });
}

export async function markSyncRunRunning(syncRunId: string) {
  await prisma.catalogSyncRun.updateMany({
    where: { id: syncRunId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

export async function incrementSyncRunCounters(
  syncRunId: string,
  delta: { products: number; variants: number }
) {
  await prisma.catalogSyncRun.update({
    where: { id: syncRunId },
    data: {
      productsProcessed: { increment: delta.products },
      variantsProcessed: { increment: delta.variants },
    },
  });
}

export async function completeSyncRun(syncRunId: string) {
  await prisma.catalogSyncRun.update({
    where: { id: syncRunId },
    data: { status: "COMPLETED", finishedAt: new Date() },
  });
}

export async function failSyncRun(syncRunId: string, error: string) {
  await prisma.catalogSyncRun.update({
    where: { id: syncRunId },
    data: { status: "FAILED", finishedAt: new Date(), error },
  });
}

export async function getLatestSyncRun(shopifyStoreId: string) {
  return prisma.catalogSyncRun.findFirst({
    where: { shopifyStoreId },
    orderBy: { createdAt: "desc" },
  });
}
