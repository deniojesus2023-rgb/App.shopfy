import "server-only";

import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { randomSlugSuffix, slugify } from "@/modules/shared/slug";
import type { User, WorkspaceRole } from "@prisma/client";
import { requireWorkspacePermission, type TenantContext } from "./tenant";

const INVITATION_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    workspace: m.workspace,
    role: m.role,
  }));
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "workspace";
  let candidate = base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${randomSlugSuffix()}`;
  }

  throw new ValidationError("Não foi possível gerar um slug único. Tente outro nome.");
}

/**
 * Cria um workspace e vincula quem criou como OWNER, dentro de uma
 * transação — não existe estado intermediário "workspace sem owner".
 */
export async function createWorkspace(user: User, name: string) {
  const slug = await generateUniqueSlug(name);

  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: { name, slug },
    });

    await tx.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role: "OWNER" },
    });

    return ws;
  });

  await logAudit({
    workspaceId: workspace.id,
    userId: user.id,
    action: "workspace.created",
    entityType: "Workspace",
    entityId: workspace.id,
    metadata: { name, slug },
  });

  return workspace;
}

// ---------------------------------------------------------------------------
// Membros
// ---------------------------------------------------------------------------

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listPendingInvitations(workspaceId: string) {
  return prisma.invitation.findMany({
    where: { workspaceId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

interface ChangeRoleInput {
  ctx: TenantContext;
  memberId: string;
  nextRole: WorkspaceRole;
}

export async function changeMemberRole({ ctx, memberId, nextRole }: ChangeRoleInput) {
  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: ctx.workspace.id },
  });
  if (!target) {
    throw new NotFoundError("Membro não encontrado.");
  }

  // Alterar o papel de/para OWNER é uma ação distinta de "gerenciar membros"
  // comuns — exige o próprio nível OWNER (ADMIN não promove nem rebaixa owners).
  if (target.role === "OWNER" || nextRole === "OWNER") {
    await requireWorkspacePermission(ctx.workspace.slug, "workspace:remove_owner");
  }

  if (target.role === "OWNER" && nextRole !== "OWNER") {
    await assertNotLastOwner(ctx.workspace.id, target.id);
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: target.id },
    data: { role: nextRole },
  });

  await logAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.member_role_changed",
    entityType: "WorkspaceMember",
    entityId: target.id,
    metadata: { fromRole: target.role, toRole: nextRole, targetUserId: target.userId },
  });

  return updated;
}

interface RemoveMemberInput {
  ctx: TenantContext;
  memberId: string;
}

export async function removeMember({ ctx, memberId }: RemoveMemberInput) {
  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: ctx.workspace.id },
  });
  if (!target) {
    throw new NotFoundError("Membro não encontrado.");
  }

  if (target.role === "OWNER") {
    await requireWorkspacePermission(ctx.workspace.slug, "workspace:remove_owner");
    await assertNotLastOwner(ctx.workspace.id, target.id);
  }

  await prisma.workspaceMember.delete({ where: { id: target.id } });

  await logAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.member_removed",
    entityType: "WorkspaceMember",
    entityId: target.id,
    metadata: { removedUserId: target.userId, role: target.role },
  });
}

async function assertNotLastOwner(workspaceId: string, excludingMemberId: string) {
  const otherOwners = await prisma.workspaceMember.count({
    where: { workspaceId, role: "OWNER", id: { not: excludingMemberId } },
  });
  if (otherOwners === 0) {
    throw new ValidationError(
      "O workspace precisa de ao menos um OWNER. Promova outro membro antes."
    );
  }
}

// ---------------------------------------------------------------------------
// Convites
// ---------------------------------------------------------------------------

function generateInvitationToken() {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

interface InviteMemberInput {
  ctx: TenantContext;
  email: string;
  role: Extract<WorkspaceRole, "ADMIN" | "MEMBER">;
}

/**
 * Retorna o token em claro apenas nesta chamada — o banco guarda só o
 * hash. É responsabilidade do caller (Server Action) montar o link de
 * convite e entregá-lo (por ora, exibido na UI para o admin copiar; envio
 * por e-mail fica para uma fase futura).
 */
export async function inviteMember({ ctx, email, role }: InviteMemberInput) {
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspace.id, user: { email } },
  });
  if (existingMember) {
    throw new ValidationError("Este e-mail já é membro do workspace.");
  }

  const existingPending = await prisma.invitation.findFirst({
    where: { workspaceId: ctx.workspace.id, email, status: "PENDING" },
  });
  if (existingPending) {
    throw new ValidationError("Já existe um convite pendente para este e-mail.");
  }

  const { raw, hash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      workspaceId: ctx.workspace.id,
      email,
      role,
      tokenHash: hash,
      expiresAt,
      invitedByUserId: ctx.user.id,
    },
  });

  await logAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.member_invited",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email, role },
  });

  return { invitation, rawToken: raw };
}

interface RevokeInvitationInput {
  ctx: TenantContext;
  invitationId: string;
}

export async function revokeInvitation({ ctx, invitationId }: RevokeInvitationInput) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, workspaceId: ctx.workspace.id, status: "PENDING" },
  });
  if (!invitation) {
    throw new NotFoundError("Convite não encontrado.");
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  await logAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.invitation_revoked",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email },
  });
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Leitura pública (sem checar membership — usada na página de preview do convite). */
export async function getInvitationByToken(rawToken: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { workspace: true },
  });

  if (!invitation) return null;
  if (invitation.status !== "PENDING") return invitation;
  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return { ...invitation, status: "EXPIRED" as const };
  }
  return invitation;
}

/**
 * Aceita um convite para o usuário autenticado. O e-mail da conta logada
 * precisa bater com o e-mail convidado — evita que alguém aceite um convite
 * destinado a outra pessoa só por ter descoberto o link.
 */
export async function acceptInvitation(user: User, rawToken: string) {
  const invitation = await getInvitationByToken(rawToken);

  if (!invitation) {
    throw new NotFoundError("Convite não encontrado.");
  }
  if (invitation.status !== "PENDING") {
    throw new ValidationError("Este convite não está mais disponível.");
  }
  if (invitation.email !== user.email) {
    throw new ValidationError(
      "Este convite foi enviado para outro e-mail. Entre com a conta correta."
    );
  }

  const workspace = await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invitation.workspaceId } },
    });

    if (!existingMembership) {
      await tx.workspaceMember.create({
        data: { userId: user.id, workspaceId: invitation.workspaceId, role: invitation.role },
      });
    }

    const ws = await tx.workspace.findUniqueOrThrow({
      where: { id: invitation.workspaceId },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });

    return ws;
  });

  await logAudit({
    workspaceId: workspace.id,
    userId: user.id,
    action: "workspace.invitation_accepted",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: user.email, role: invitation.role },
  });

  return workspace;
}
