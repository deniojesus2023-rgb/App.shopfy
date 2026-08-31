"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { ValidationError } from "@/modules/shared/errors";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import { disconnectStore } from "./service";
import { disconnectStoreSchema } from "./schemas";

export async function disconnectStoreAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = disconnectStoreSchema.safeParse({ storeId: formData.get("storeId") });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "shopify:manage_stores");
    await disconnectStore({ ctx, storeId: parsed.data.storeId });

    revalidatePath(`/${workspaceSlug}/stores`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}
