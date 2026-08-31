# App.shopfy

SaaS multi-tenant para funis de vendas gamificados conectados a lojas Shopify.
Este repositório contém a **Fase 0**: fundação, autenticação (Clerk),
workspaces, membros, RBAC e auditoria. Shopify, funis e COD ainda não foram
implementados.

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind CSS ·
shadcn/ui · Clerk

## Setup local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha:
   - `DATABASE_URL`: connection string de um Postgres (local ou hospedado).
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`: em
     https://dashboard.clerk.com → API Keys.
   - `CLERK_WEBHOOK_SIGNING_SECRET`: crie um endpoint em Clerk → Webhooks
     apontando para `<sua-url>/api/webhooks/clerk`, eventos `user.created`,
     `user.updated`, `user.deleted`.
3. Aplique o schema no banco:
   ```bash
   npm run db:push        # MVP / prototipagem rápida
   # ou, para gerar migrations versionadas:
   npm run db:migrate
   ```
4. Rode o servidor:
   ```bash
   npm run dev
   ```

## Estrutura

```
src/
  app/                         → rotas (App Router)
    [workspaceSlug]/           → área autenticada de um workspace
    invitations/[token]/       → aceite público de convite
    api/webhooks/clerk/        → sincronização de usuários
  modules/
    identity/                  → User, sincronização com Clerk
    workspaces/                → Workspace, membros, convites, RBAC, tenant isolation
    audit/                     → AuditLog
    shared/                    → erros de domínio, ActionResult, slug
  components/ui/                → primitives shadcn/ui
prisma/schema.prisma            → schema do banco
```

## Isolamento multi-tenant

Toda leitura/escrita de dado de um workspace passa por
`requireWorkspaceMember` / `requireWorkspaceRole` / `requireWorkspacePermission`
(`src/modules/workspaces/tenant.ts`), que resolve a sessão Clerk, confirma
que o usuário pertence ao workspace do slug da URL, e só então libera o
`workspaceId` para uso em queries. Nenhum service de domínio deve montar uma
query Prisma usando um `workspaceId` vindo direto do client.
