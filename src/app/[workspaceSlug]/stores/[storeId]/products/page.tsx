import Link from "next/link";

import { listProducts, type ProductStatusFilter } from "@/modules/catalog/service";
import { getLatestSyncRun } from "@/modules/catalog/sync-run";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";
import { NotFoundError } from "@/modules/shared/errors";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FiltersBar } from "./filters-bar";
import { ProductsGrid } from "./products-grid";
import { SyncButton } from "./sync-button";
import { SyncStatusCard } from "./sync-status-card";

const VALID_STATUSES: ProductStatusFilter[] = ["ALL", "ACTIVE", "DRAFT", "ARCHIVED"];

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; storeId: string }>;
  searchParams: Promise<{ search?: string; status?: string; cursor?: string }>;
}) {
  const { workspaceSlug, storeId } = await params;
  const query = await searchParams;

  const ctx = await requireWorkspaceMember(workspaceSlug);
  if (!roleHasPermission(ctx.role, "shopify:view_catalog")) {
    notFound();
  }

  const store = await prisma.shopifyStore.findFirst({
    where: { id: storeId, workspaceId: ctx.workspace.id },
  });
  if (!store) {
    throw new NotFoundError("Loja não encontrada.");
  }

  const status: ProductStatusFilter = VALID_STATUSES.includes(query.status as ProductStatusFilter)
    ? (query.status as ProductStatusFilter)
    : "ALL";
  const search = query.search?.trim() ?? "";

  const [{ items, nextCursor }, latestRun] = await Promise.all([
    listProducts({
      workspaceId: ctx.workspace.id,
      shopifyStoreId: store.id,
      status,
      search: search || undefined,
      cursor: query.cursor,
    }),
    getLatestSyncRun(store.id),
  ]);

  const canSync = roleHasPermission(ctx.role, "shopify:sync_catalog");
  const basePath = `/${workspaceSlug}/stores/${storeId}/products`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-neutral-600">{store.displayName ?? store.shopDomain}</p>
        </div>
        {canSync && <SyncButton workspaceSlug={workspaceSlug} storeId={store.id} />}
      </div>

      <SyncStatusCard run={latestRun} />

      <FiltersBar basePath={basePath} search={search} status={status} />

      <ProductsGrid products={items} />

      {(nextCursor || query.cursor) && (
        <div className="flex justify-between text-sm">
          {query.cursor ? (
            <Link href={`${basePath}?status=${status}${search ? `&search=${search}` : ""}`}>
              ← Início
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link
              href={`${basePath}?status=${status}${search ? `&search=${search}` : ""}&cursor=${nextCursor}`}
            >
              Próxima página →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
