"use server";

import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { ValidationError } from "@/modules/shared/errors";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import { createPreviewToken } from "../runtime/preview-token";
import { prisma } from "@/lib/db";

const inputSchema = z.object({ funnelId: z.string().cuid() });

/**
 * Emite um token de preview para o rascunho ativo do funil. Nunca expõe o
 * rascunho por um ID previsível — só quem tem `funnels:edit` consegue gerar
 * este link, e ele expira sozinho (ver runtime/preview-token.ts).
 */
export async function createDraftPreviewLinkAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<{ previewUrl: string }>> {
  try {
    const parsed = inputSchema.safeParse({ funnelId: formData.get("funnelId") });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:edit");

    const draft = await prisma.funnelVersion.findFirst({
      where: { funnelId: parsed.data.funnelId, workspaceId: ctx.workspace.id, status: "DRAFT" },
    });
    if (!draft) {
      throw new ValidationError("Não há rascunho para pré-visualizar.");
    }

    const token = createPreviewToken(parsed.data.funnelId, draft.id);
    return actionOk({ previewUrl: `/f/preview/${token}` });
  } catch (error) {
    return actionError(error);
  }
}
