"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { listProducts, type ProductListItem } from "@/modules/catalog/service";
import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";

const searchSchema = z.object({
  shopifyStoreId: z.string().cuid(),
  search: z.string().max(200).optional(),
  cursor: z.string().cuid().optional(),
});

/**
 * Base do `ProductSelector` — busca+paginação sempre tenant-scoped no
 * servidor. Reaproveita `listProducts` do catálogo (Fase 1B); nunca aceita
 * `workspaceId` do client, só resolve via sessão + slug do workspace.
 */
export async function searchStoreProductsAction(
  workspaceSlug: string,
  input: { shopifyStoreId: string; search?: string; cursor?: string }
): Promise<ActionResult<{ items: ProductListItem[]; nextCursor: string | null }>> {
  try {
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:view");

    const store = await prisma.shopifyStore.findFirst({
      where: { id: parsed.data.shopifyStoreId, workspaceId: ctx.workspace.id },
      select: { id: true },
    });
    if (!store) {
      throw new NotFoundError("Loja não encontrada.");
    }

    const result = await listProducts({
      workspaceId: ctx.workspace.id,
      shopifyStoreId: store.id,
      status: "ACTIVE",
      search: parsed.data.search,
      cursor: parsed.data.cursor,
      pageSize: 12,
    });

    return actionOk(result);
  } catch (error) {
    return actionError(error);
  }
}

const setUpsellSchema = z.object({
  funnelId: z.string().cuid(),
  productId: z.string().cuid(),
});

/**
 * Substitui o produto UPSELL do funil (no máximo um por vez nesta fase).
 * Reforça cross-workspace/cross-store como toda associação de produto a
 * funil já faz desde a Fase 2A — nunca aceita um Product de fora da mesma
 * ShopifyStore do funil.
 */
export async function setUpsellProductAction(
  workspaceSlug: string,
  input: { funnelId: string; productId: string }
): Promise<ActionResult<{ productId: string; title: string }>> {
  try {
    const parsed = setUpsellSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:edit");

    const funnel = await prisma.funnel.findFirst({
      where: { id: parsed.data.funnelId, workspaceId: ctx.workspace.id },
      select: { id: true, shopifyStoreId: true },
    });
    if (!funnel) {
      throw new NotFoundError("Funil não encontrado.");
    }

    const product = await prisma.product.findFirst({
      where: {
        id: parsed.data.productId,
        workspaceId: ctx.workspace.id,
        shopifyStoreId: funnel.shopifyStoreId,
      },
      select: { id: true, title: true },
    });
    if (!product) {
      throw new ValidationError("Produto não encontrado nesta loja/workspace.");
    }

    await prisma.$transaction([
      prisma.funnelProduct.deleteMany({ where: { funnelId: funnel.id, role: "UPSELL" } }),
      prisma.funnelProduct.create({
        data: { workspaceId: ctx.workspace.id, funnelId: funnel.id, productId: product.id, role: "UPSELL" },
      }),
    ]);

    await logAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "funnel.draft_updated",
      entityType: "FunnelProduct",
      entityId: funnel.id,
      metadata: { role: "UPSELL", productId: product.id },
    });

    revalidatePath(`/${workspaceSlug}/funnels/${funnel.id}/builder`);
    return actionOk({ productId: product.id, title: product.title });
  } catch (error) {
    return actionError(error);
  }
}
