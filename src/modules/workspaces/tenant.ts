import "server-only";

import { prisma } from "@/lib/db";
import { requireUser } from "@/modules/identity/service";
import { ForbiddenError, NotFoundError } from "@/modules/shared/errors";
import type { User, Workspace, WorkspaceRole } from "@prisma/client";
import { roleAtLeast, roleHasPermission, type WorkspacePermission } from "./permissions";

export interface TenantContext {
  user: User;
  workspace: Workspace;
  role: WorkspaceRole;
}

/**
 * Ponto único de resolução de tenant. Toda leitura/escrita de dado que
 * pertence a um workspace DEVE passar por aqui primeiro — nunca aceite um
 * `workspaceId` vindo do client sem validar membership.
 *
 * workspaceSlug não encontrado ou usuário sem vínculo => NotFoundError
 * (nunca ForbiddenError: não confirmamos a um usuário não-membro que o
 * workspace existe).
 */
export async function requireWorkspaceMember(
  workspaceSlug: string
): Promise<TenantContext> {
  const user = await requireUser();

  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });
  if (!workspace) {
    throw new NotFoundError("Workspace não encontrado.");
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
  });
  if (!membership) {
    throw new NotFoundError("Workspace não encontrado.");
  }

  return { user, workspace, role: membership.role };
}

export async function requireWorkspaceRole(
  workspaceSlug: string,
  minimumRole: WorkspaceRole
): Promise<TenantContext> {
  const ctx = await requireWorkspaceMember(workspaceSlug);
  if (!roleAtLeast(ctx.role, minimumRole)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export async function requireWorkspacePermission(
  workspaceSlug: string,
  permission: WorkspacePermission
): Promise<TenantContext> {
  const ctx = await requireWorkspaceMember(workspaceSlug);
  if (!roleHasPermission(ctx.role, permission)) {
    throw new ForbiddenError();
  }
  return ctx;
}

/**
 * Client Prisma "escopado": todo método aqui já embute `workspaceId` no
 * `where`, então um service de domínio não tem como esquecer o filtro de
 * tenant — ele simplesmente não tem acesso a uma query sem esse filtro.
 *
 * Módulos futuros (Products, Funnels, Orders, ...) devem seguir este
 * mesmo padrão: um `scoped*` por entidade, nunca `prisma.<model>.findMany`
 * direto dentro de um service de domínio.
 */
export function scopedAuditLog(workspaceId: string) {
  return {
    findMany: (args?: Parameters<typeof prisma.auditLog.findMany>[0]) =>
      prisma.auditLog.findMany({
        ...args,
        where: { ...args?.where, workspaceId },
      }),
  };
}
