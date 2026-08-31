import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.member_invited"
  | "workspace.invitation_revoked"
  | "workspace.invitation_accepted"
  | "workspace.member_role_changed"
  | "workspace.member_removed"
  | "shopify.store_connect_started"
  | "shopify.store_connected"
  | "shopify.store_disconnected"
  | "shopify.store_uninstalled_webhook"
  | "shopify.webhook_registration_failed";

interface LogAuditInput {
  workspaceId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Registra um evento de auditoria. Best-effort: uma falha aqui nunca deve
 * derrubar a ação de negócio que a originou — logamos e seguimos.
 * IP/User-Agent são lidos dos headers da própria request quando disponíveis
 * (Server Actions e Route Handlers têm acesso via `headers()`).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : null;
    const userAgent = headerList.get("user-agent");

    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
  }
}
