# App.shopfy

SaaS multi-tenant para funis de vendas gamificados conectados a lojas Shopify.
Este repositório contém a **Fase 0** (fundação, autenticação, workspaces,
RBAC, auditoria) e a **Fase 1A** (conexão de loja Shopify via OAuth +
webhooks). Importação de produtos, funis, COD, pagamentos e fornecedores
ainda não foram implementados.

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind CSS ·
shadcn/ui · Clerk · Shopify Admin GraphQL API

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
   - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`: em partners.shopify.com → seu
     app → Client credentials. Configure a Allowed redirection URL como
     `<sua-url>/api/shopify/oauth/callback`.
   - `SHOPIFY_TOKEN_ENCRYPTION_KEY`: gere com `openssl rand -base64 32`.
   - Em dev, exponha `localhost:3000` com `ngrok`/`cloudflared` e use essa
     URL pública em `NEXT_PUBLIC_APP_URL` — a Shopify não redireciona/entrega
     webhook para `localhost`.
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
  app/                                → rotas (App Router)
    [workspaceSlug]/                  → área autenticada de um workspace
      stores/                         → conectar/listar/desconectar lojas Shopify
      members/                        → gestão de membros
    invitations/[token]/              → aceite público de convite
    api/
      webhooks/clerk/                 → sincronização de usuários
      shopify/
        oauth/install/                → inicia o OAuth (redirect 302)
        oauth/callback/                → troca code por token, conecta a loja
        webhooks/[topic]/              → recebe webhooks Shopify (HMAC + idempotência)
  modules/
    identity/                         → User, sincronização com Clerk
    workspaces/                       → Workspace, membros, convites, RBAC, tenant isolation
    shopify/
      domain.ts                       → normalização/validação de shopDomain
      scopes.ts                       → escopos OAuth pedidos e por quê
      encryption.ts                   → AES-256-GCM para o access token em repouso
      client.ts                       → ShopifyClient centralizado (Admin GraphQL)
      oauth/                          → state (uso único), troca code→token, URL de autorização
      stores/                         → ShopifyStore: conectar, desconectar, listar, token descriptografado
      webhooks/                       → tópicos, verificação HMAC, persistência idempotente, processamento
    audit/                            → AuditLog
    shared/                           → erros de domínio, ActionResult, slug, rate limit
  components/ui/                       → primitives shadcn/ui
prisma/schema.prisma                   → schema do banco
```

## Isolamento multi-tenant

Toda leitura/escrita de dado de um workspace passa por
`requireWorkspaceMember` / `requireWorkspaceRole` / `requireWorkspacePermission`
(`src/modules/workspaces/tenant.ts`), que resolve a sessão Clerk, confirma
que o usuário pertence ao workspace do slug da URL, e só então libera o
`workspaceId` para uso em queries. Nenhum service de domínio deve montar uma
query Prisma usando um `workspaceId` vindo direto do client.

## Shopify — OAuth e webhooks (Fase 1A)

- **Conectar loja**: form em `/[workspaceSlug]/stores` faz POST para
  `/api/shopify/oauth/install` (rota, não Server Action — o passo seguinte é
  um redirect 302 para fora da aplicação). A rota revalida permissão
  (`shopify:manage_stores`, OWNER/ADMIN) no servidor, gera um
  `ShopifyOAuthState` de uso único com expiração de 10 min, e redireciona
  para a tela de autorização da Shopify.
- **Callback**: `/api/shopify/oauth/callback` exige `state` válido e não
  consumido (marcado atomicamente via `updateMany` para impedir replay) **e**
  HMAC da query string válido. Só então troca `code` por access token,
  criptografa (AES-256-GCM) e persiste `ShopifyStore`, registra os 5
  webhooks obrigatórios via `webhookSubscriptionCreate` e grava `AuditLog`.
- **Token**: nunca retorna ao client. `getDecryptedAccessToken()`
  (`modules/shopify/stores/service.ts`) é o único ponto do sistema que
  descriptografa, e só server-side.
- **Webhooks**: `/api/shopify/webhooks/[topic]` verifica HMAC sobre o corpo
  raw, persiste o evento de forma idempotente (`shopifyWebhookId` é único —
  reentrega da Shopify não gera efeito duplicado) e responde rápido; o
  processamento roda depois via `after()`, fora do caminho crítico da
  resposta. Nesta fase, só `app/uninstalled` tem lógica real (desconecta a
  loja e limpa o token); os demais tópicos ficam persistidos como `IGNORED`
  para as próximas fases (Catalog, Orders).

### Escopos OAuth pedidos

| Escopo | Por quê |
| --- | --- |
| `read_products` | Fase 1B (importação de catálogo) — pedido já agora para não reautorizar o app duas vezes seguidas |
| `read_orders` | Reconciliar pedidos existentes na loja |
| `write_orders` | Criar o pedido na Shopify a partir do fluxo COD (Fase 3) |
| `read_fulfillments` | Status de envio/entrega (Fase 3) |

Deliberadamente fora de escopo: `write_products`, `read_customers`,
`write_customers`, qualquer escopo de billing/checkout.

## Testes

```bash
npm test
```

Cobre os helpers de segurança críticos: `normalizeShopDomain`, validação de
state OAuth (uso único, expiração, replay), verificação de HMAC (webhook e
callback OAuth), round-trip de criptografia do token, e idempotência de
persistência de webhook.
