"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/modules/identity/service";
import { actionError, actionOk, type ActionResult } from "@/modules/shared/action-result";
import { ValidationError } from "@/modules/shared/errors";
import * as workspaceService from "./service";
import { requireWorkspacePermission } from "./tenant";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
  removeMemberSchema,
  revokeInvitationSchema,
} from "./schemas";

// Toda Server Action segue o mesmo formato: 1) parse com Zod (nunca confiar
// no payload do client), 2) autorizar (nunca confiar em o que a UI mostrou),
// 3) delegar ao service, 4) revalidar a rota afetada, 5) devolver
// ActionResult (nunca lançar direto para o client).

export async function createWorkspaceAction(
  _prevState: ActionResult<{ slug: string }> | null,
  formData: FormData
): Promise<ActionResult<{ slug: string }>> {
  try {
    const parsed = createWorkspaceSchema.safeParse({ name: formData.get("name") });
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos.", fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requireUser();
    const workspace = await workspaceService.createWorkspace(user, parsed.data.name);

    revalidatePath("/workspaces");
    return actionOk({ slug: workspace.slug });
  } catch (error) {
    return actionError(error);
  }
}

export async function inviteMemberAction(
  workspaceSlug: string,
  _prevState: ActionResult<{ inviteUrl: string }> | null,
  formData: FormData
): Promise<ActionResult<{ inviteUrl: string }>> {
  try {
    const parsed = inviteMemberSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
    });
    if (!parsed.success) {
      return { ok: false, error: "Dados inválidos.", fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const ctx = await requireWorkspacePermission(workspaceSlug, "workspace:manage_members");
    const { rawToken } = await workspaceService.inviteMember({
      ctx,
      email: parsed.data.email,
      role: parsed.data.role,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = `${appUrl}/invitations/${rawToken}`;

    revalidatePath(`/${workspaceSlug}/members`);
    return actionOk({ inviteUrl });
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeInvitationAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = revokeInvitationSchema.safeParse({
      invitationId: formData.get("invitationId"),
    });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "workspace:manage_members");
    await workspaceService.revokeInvitation({ ctx, invitationId: parsed.data.invitationId });

    revalidatePath(`/${workspaceSlug}/members`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function changeMemberRoleAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = changeMemberRoleSchema.safeParse({
      memberId: formData.get("memberId"),
      role: formData.get("role"),
    });
    if (!parsed.success) throw new ValidationError();

    // requireWorkspacePermission aqui cobre o caso comum (ADMIN alterando
    // MEMBER); o service reforça a checagem extra quando OWNER está envolvido.
    const ctx = await requireWorkspacePermission(workspaceSlug, "workspace:manage_members");
    await workspaceService.changeMemberRole({
      ctx,
      memberId: parsed.data.memberId,
      nextRole: parsed.data.role,
    });

    revalidatePath(`/${workspaceSlug}/members`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function removeMemberAction(
  workspaceSlug: string,
  formData: FormData
): Promise<ActionResult<null>> {
  try {
    const parsed = removeMemberSchema.safeParse({ memberId: formData.get("memberId") });
    if (!parsed.success) throw new ValidationError();

    const ctx = await requireWorkspacePermission(workspaceSlug, "workspace:manage_members");
    await workspaceService.removeMember({ ctx, memberId: parsed.data.memberId });

    revalidatePath(`/${workspaceSlug}/members`);
    return actionOk(null);
  } catch (error) {
    return actionError(error);
  }
}

export async function acceptInvitationAction(
  _prevState: ActionResult<{ workspaceSlug: string }> | null,
  formData: FormData
): Promise<ActionResult<{ workspaceSlug: string }>> {
  try {
    const parsed = acceptInvitationSchema.safeParse({ token: formData.get("token") });
    if (!parsed.success) throw new ValidationError("Convite inválido.");

    const user = await requireUser();
    const workspace = await workspaceService.acceptInvitation(user, parsed.data.token);

    revalidatePath("/workspaces");
    return actionOk({ workspaceSlug: workspace.slug });
  } catch (error) {
    return actionError(error);
  }
}
