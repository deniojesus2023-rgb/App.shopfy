"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { ValidationError } from "@/modules/shared/errors";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import {
  archiveFunnelSchema,
  createFunnelSchema,
  publishFunnelSchema,
  updateDraftConfigSchema,
} from "./schemas";
import * as funnelService from "./service";

export async function createFunnelAction(
  workspaceSlug: string,
  _prevState: ActionResult<{ funnelId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ funnelId: string }>> {
  try {
    const parsed = createFunnelSchema.safeParse({
      shopifyStoreId: formData.get("shopifyStoreId"),
      productId: formData.get("productId"),
      templateKey: formData.get("templateKey"),
      name: formData.get("name"),
      slug: formData.get("slug") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos.", fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:create");

    const funnel = await funnelService.createFunnel({
      workspaceId: ctx.workspace.id,
      shopifyStoreId: parsed.data.shopifyStoreId,
      productId: parsed.data.productId,
      templateKey: parsed.data.templateKey,
      name: parsed.data.name,
      slug: parsed.data.slug,
      user: ctx.user,
    });

    revalidatePath(`/${workspaceSlug}/funnels`);
    return actionOk({ funnelId: funnel.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateDraftConfigAction(
  workspaceSlug: string,
  funnelId: string,
  formData: FormData
): Promise<ActionResult<{ revision: number }>> {
  try {
    const parsed = updateDraftConfigSchema.safeParse({
      versionId: formData.get("versionId"),
      expectedRevision: formData.get("expectedRevision"),
      configJson: formData.get("configJson"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos.", fieldErrors: parsed.error.flatten().fieldErrors };
    }

    let configValue: unknown;
    try {
      configValue = JSON.parse(parsed.data.configJson);
    } catch {
      throw new ValidationError("O config não é um JSON válido.");
    }

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:edit");

    const updated = await funnelService.updateDraftConfig({
      workspaceId: ctx.workspace.id,
      funnelId,
      versionId: parsed.data.versionId,
      expectedRevision: parsed.data.expectedRevision,
      config: configValue,
      user: ctx.user,
    });

    revalidatePath(`/${workspaceSlug}/funnels/${funnelId}`);
    return actionOk({ revision: updated.revision });
  } catch (error) {
    return actionError(error);
  }
}

export async function ensureDraftVersionAction(
  workspaceSlug: string,
  funnelId: string
): Promise<ActionResult<{ versionId: string }>> {
  try {
    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:edit");
    const draft = await funnelService.getOrCreateDraftVersion(ctx.workspace.id, funnelId);
    revalidatePath(`/${workspaceSlug}/funnels/${funnelId}`);
    return actionOk({ versionId: draft.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function publishFunnelAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = publishFunnelSchema.safeParse({ funnelId: formData.get("funnelId") });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:publish");
    await funnelService.publishFunnel(ctx.workspace.id, parsed.data.funnelId, ctx.user);

    revalidatePath(`/${workspaceSlug}/funnels/${parsed.data.funnelId}`);
    revalidatePath(`/${workspaceSlug}/funnels`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveFunnelAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = archiveFunnelSchema.safeParse({ funnelId: formData.get("funnelId") });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:archive");
    await funnelService.archiveFunnel(ctx.workspace.id, parsed.data.funnelId, ctx.user);

    revalidatePath(`/${workspaceSlug}/funnels/${parsed.data.funnelId}`);
    revalidatePath(`/${workspaceSlug}/funnels`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}
