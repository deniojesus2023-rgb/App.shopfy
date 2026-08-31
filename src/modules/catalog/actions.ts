"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/modules/audit/service";
import { enqueueJob } from "@/modules/queue/service";
import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { ValidationError } from "@/modules/shared/errors";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import { getShopifyStoreForWorkspace } from "./service";
import { createSyncRun } from "./sync-run";

/**
 * Dispara uma importação/sincronização completa do catálogo. Só cria o
 * `CatalogSyncRun` e enfileira o primeiro job — nunca busca produtos aqui
 * dentro da Server Action. O worker (cron) processa página por página.
 */
export async function triggerFullCatalogSyncAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<{ syncRunId: string }>> {
  try {
    const storeId = String(formData.get("storeId") ?? "");
    if (!storeId) throw new ValidationError("Loja não informada.");

    const ctx = await requireWorkspacePermission(workspaceSlug, "shopify:sync_catalog");
    const store = await getShopifyStoreForWorkspace(ctx.workspace.id, storeId);

    if (store.status !== "CONNECTED") {
      throw new ValidationError(
        "Esta loja não está conectada. Reconecte-a antes de sincronizar o catálogo."
      );
    }

    const syncRun = await createSyncRun({
      workspaceId: ctx.workspace.id,
      shopifyStoreId: store.id,
      type: "FULL",
    });

    await enqueueJob({
      type: "SHOPIFY_FULL_CATALOG_SYNC",
      workspaceId: ctx.workspace.id,
      payload: {
        workspaceId: ctx.workspace.id,
        shopifyStoreId: store.id,
        syncRunId: syncRun.id,
      },
    });

    await logAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "catalog.sync_triggered",
      entityType: "CatalogSyncRun",
      entityId: syncRun.id,
      metadata: { shopDomain: store.shopDomain },
    });

    revalidatePath(`/${workspaceSlug}/stores/${storeId}/products`);
    return actionOk({ syncRunId: syncRun.id });
  } catch (error) {
    return actionError(error);
  }
}
