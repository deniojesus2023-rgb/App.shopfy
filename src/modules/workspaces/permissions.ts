import type { WorkspaceRole } from "@prisma/client";

// -----------------------------------------------------------------------
// Modelo de RBAC — Fase 0
//
// Papéis: OWNER > ADMIN > MEMBER (ordem também usada para comparação de
// nível mínimo exigido por uma action).
//
// Cada permissão é uma string de domínio ("workspace:manage_members"), não
// um booleano solto — isso permite adicionar permissões novas por módulo
// (ex.: "funnel:publish" na Fase 2) sem redesenhar o sistema de papéis.
// -----------------------------------------------------------------------

export const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

export type WorkspacePermission =
  | "workspace:update_settings"
  | "workspace:manage_members" // convidar, alterar papel de ADMIN/MEMBER, remover ADMIN/MEMBER
  | "workspace:remove_owner" // remover ou rebaixar um OWNER — restrito ao próprio OWNER
  | "workspace:view_members"
  | "workspace:view_audit_log"
  | "shopify:manage_stores" // conectar/desconectar loja Shopify — OWNER e ADMIN
  | "shopify:view_stores"
  | "shopify:view_catalog" // OWNER, ADMIN e MEMBER
  | "shopify:sync_catalog"; // disparar importação/sincronização — OWNER e ADMIN

const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  OWNER: [
    "workspace:update_settings",
    "workspace:manage_members",
    "workspace:remove_owner",
    "workspace:view_members",
    "workspace:view_audit_log",
    "shopify:manage_stores",
    "shopify:view_stores",
    "shopify:view_catalog",
    "shopify:sync_catalog",
  ],
  ADMIN: [
    "workspace:manage_members",
    "workspace:view_members",
    "workspace:view_audit_log",
    "shopify:manage_stores",
    "shopify:view_stores",
    "shopify:view_catalog",
    "shopify:sync_catalog",
  ],
  MEMBER: ["workspace:view_members", "shopify:view_stores", "shopify:view_catalog"],
};

export function roleHasPermission(
  role: WorkspaceRole,
  permission: WorkspacePermission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[minimum];
}
