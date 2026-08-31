# App.shopfy

SaaS multi-tenant para funis de vendas gamificados conectados a lojas Shopify.
Este repositório contém a **Fase 0** (fundação, autenticação, workspaces,
RBAC, auditoria), a **Fase 1A** (conexão de loja Shopify via OAuth + webhooks),
a **Fase 1B** (fila persistente + importação/sincronização de catálogo), a
**Fase 2A** (motor de configuração de funis: draft/versão/publicação) e a
**Fase 2B** (storefront público + runtime de funil em `/f/[publicId]/[slug]`).
Editor visual drag-and-drop, COD funcional (criação de pedido/lead real),
gamificação real, pagamentos, fornecedores, WhatsApp e domínio próprio ainda
não foram implementados — o storefront público é uma experiência de
demonstração (ver seção abaixo).

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
   - `CRON_SECRET`: gere com `openssl rand -hex 32` (protege o worker da fila).
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
5. **Fila de jobs**: em produção (Vercel), `vercel.json` já agenda
   `/api/cron/process-jobs` a cada minuto. **Em dev local não há cron** —
   dispare manualmente enquanto testa uma importação:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-jobs
   ```

## Estrutura

```
src/
  app/                                     → rotas (App Router)
    [workspaceSlug]/                       → área autenticada de um workspace
      stores/                              → conectar/listar/desconectar lojas Shopify
        [storeId]/products/                → catálogo importado (busca, filtro, paginação)
      members/                             → gestão de membros
    invitations/[token]/                   → aceite público de convite
    api/
      webhooks/clerk/                      → sincronização de usuários
      shopify/
        oauth/install/                     → inicia o OAuth (redirect 302)
        oauth/callback/                     → troca code por token, conecta a loja
        webhooks/[topic]/                   → recebe webhooks Shopify (HMAC + idempotência)
      cron/process-jobs/                    → worker da fila (chamado pelo cron da Vercel)
  modules/
    identity/                              → User, sincronização com Clerk
    workspaces/                            → Workspace, membros, convites, RBAC, tenant isolation
    shopify/
      domain.ts                            → normalização/validação de shopDomain
      scopes.ts                            → escopos OAuth pedidos e por quê
      encryption.ts                        → AES-256-GCM para o access token em repouso
      client.ts                            → ShopifyClient centralizado (Admin GraphQL, custo/throttle, erros tipados)
      oauth/                               → state (uso único), troca code→token, URL de autorização
      stores/                              → ShopifyStore: conectar, desconectar, listar, token descriptografado
      webhooks/                            → tópicos, verificação HMAC, persistência idempotente, ensureRequiredWebhooks
    queue/                                 → fila persistente em Postgres (enqueue/claim/complete/fail)
    catalog/
      graphql.ts                           → query de página do catálogo + produto único
      transform.ts                         → Shopify → modelo local (função pura)
      service.ts                           → upsert idempotente, soft delete, reconciliação, listagem paginada
      sync-run.ts                          → CatalogSyncRun (status, contadores)
      handlers/                            → um handler por BackgroundJobType
      actions.ts                           → Server Action que dispara o full sync
    audit/                                 → AuditLog
    shared/                                → erros de domínio, ActionResult, slug, rate limit
  components/ui/                            → primitives shadcn/ui
prisma/schema.prisma                        → schema do banco
vercel.json                                 → agenda o cron de processamento da fila
```

## Isolamento multi-tenant

Toda leitura/escrita de dado de um workspace passa por
`requireWorkspaceMember` / `requireWorkspaceRole` / `requireWorkspacePermission`
(`src/modules/workspaces/tenant.ts`), que resolve a sessão Clerk, confirma
que o usuário pertence ao workspace do slug da URL, e só então libera o
`workspaceId` para uso em queries. Nenhum service de domínio deve montar uma
query Prisma usando um `workspaceId` vindo direto do client. No catálogo, toda
entidade carrega `workspaceId` **e** `shopifyStoreId`, e a unicidade Shopify
(`shopifyProductId`, `shopifyVariantId`) é escopada por loja, nunca global.

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
  criptografa (AES-256-GCM) e persiste `ShopifyStore`, registra os webhooks
  obrigatórios via `webhookSubscriptionCreate` e grava `AuditLog`.
- **Token**: nunca retorna ao client. `getDecryptedAccessToken()`
  (`modules/shopify/stores/service.ts`) é o único ponto do sistema que
  descriptografa, e só server-side.
- **Webhooks**: `/api/shopify/webhooks/[topic]` verifica HMAC sobre o corpo
  raw, persiste o evento de forma idempotente (`shopifyWebhookId` é único —
  reentrega da Shopify não gera efeito duplicado) e responde rápido.
  `app/uninstalled` é processado inline via `after()` (best-effort, uma
  única linha, idempotente). `products/update` e `products/delete`
  enfileiram um job na fila persistente em vez de processar inline — podem
  envolver chamada de rede à Shopify e precisam de retry/crash-recovery.
- **ensureRequiredWebhooks**: idempotente — compara as subscriptions já
  registradas na loja contra a lista obrigatória e cria só as que faltam.
  Roda automaticamente no início de todo full sync, então uma loja
  conectada antes de uma fase que adicionou um novo tópico (ex.:
  `products/delete`, que chegou na 1B) não precisa reconectar.

### Escopos OAuth pedidos

| Escopo | Por quê |
| --- | --- |
| `read_products` | Importação/sincronização de catálogo (Fase 1B) |
| `read_orders` | Reconciliar pedidos existentes na loja |
| `write_orders` | Criar o pedido na Shopify a partir do fluxo COD (Fase 3) |
| `read_fulfillments` | Status de envio/entrega (Fase 3) |

Deliberadamente fora de escopo: `write_products`, `read_customers`,
`write_customers`, qualquer escopo de billing/checkout.

## Catálogo — fila e importação (Fase 1B)

- **Fila persistente em Postgres** (`modules/queue/`, tabela
  `background_jobs`): `claimNextJob` reivindica atomicamente via
  `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` — dois workers
  nunca pegam o mesmo job. Jobs travados em `PROCESSING` há mais de 5 min
  (worker morto) voltam a ficar elegíveis. `failJob` reagenda com backoff
  exponencial (30s → cap de 15min) até `maxAttempts`; erros marcados como
  não-retentáveis (`NonRetryableJobError` — token inválido, loja
  desconectada) vão direto para `FAILED`.
- **Execução**: sem worker de longa duração no Vercel serverless — um cron
  (`vercel.json`, a cada minuto) bate em `/api/cron/process-jobs`
  (protegido por `CRON_SECRET`) e processa até 5 jobs por invocação.
- **Full sync**: um job processa **uma página** de produtos (50 por vez,
  com todas as variantes — o limite da Shopify é 100 variantes/produto, o
  que elimina qualquer N+1). Se houver próxima página, o próprio job
  enfileira a continuação com o cursor; a página inteira do produto é
  upsertada numa transação por produto (não a loja inteira numa
  transação só).
- **Produtos removidos**: cada produto tocado num full sync recebe
  `lastSeenSyncRunId = <id do CatalogSyncRun>`. A reconciliação
  ("sumiu = removido") só roda **depois** que o run inteiro chega a
  `COMPLETED` — uma paginação incompleta ou um erro no meio nunca gera
  exclusão falsa.
- **CatalogSyncRun**: uma linha por execução (`FULL`/`INCREMENTAL`),
  alimenta o card "Última sincronização" da UI com contadores de produtos e
  variantes processados.
- **Erros da Shopify**: `ShopifyClient` detecta HTTP 401 (token
  inválido/revogado → marca a loja `REAUTH_REQUIRED`, falha o job sem
  retry) e `THROTTLED` nos `errors[].extensions.code` (cost-based rate
  limit → falha retentável, backoff normal da fila). O `throttleStatus` da
  resposta é usado para adiar a próxima página quando a Shopify sinaliza
  pouca capacidade restante.

## Funis — motor de configuração (Fase 2A)

- **Funnel vs. FunnelVersion**: `Funnel` é a identidade lógica (nome, slug,
  loja, produto principal); `FunnelVersion` é uma versão do config, imutável
  assim que `PUBLISHED`. Editar sempre acontece numa `DRAFT` — nunca na
  versão publicada.
- **Config versionado**: `modules/funnels/config/schema.ts` define
  `FunnelConfigV1` (tema + até 20 etapas de 7 tipos possíveis, via
  `z.discriminatedUnion`). `parseFunnelConfig(configSchemaVersion, config)`
  é o único ponto de leitura do JSON armazenado. `migrateFunnelConfig`
  existe como contrato para quando uma v2 de schema aparecer — hoje só há
  v1, então o contrato é só passagem direta.
- **Sem HTML/CSS/JS arbitrário**: todo texto livre passa por `safeText()`
  (rejeita tags, `javascript:`, handlers de evento) e toda cor por um regex
  hexadecimal estrito.
- **Validação semântica** (`semantic-validation.ts`), além do Zod
  estrutural: exatamente uma etapa `PRODUCT` e uma `SUCCESS` habilitadas,
  `COD_FORM` exige `PAYMENT_CHOICE` com `allowCod=true`, `UPSELL` exige um
  `FunnelProduct` com `role=UPSELL`, e nenhum `FunnelProduct` pode apontar
  para um produto de outro workspace/loja.
- **Optimistic concurrency**: `FunnelVersion.revision` — todo save de draft
  usa `WHERE revision = <valor que o cliente tinha>`; se não bateu (outra
  aba salvou primeiro), `ConflictError` (a UI pede para recarregar).
- **Publicação**: valida, roda a validação semântica, e numa transação
  marca a versão publicada anterior como `SUPERSEDED`, a draft atual como
  `PUBLISHED`, e atualiza `Funnel.publishedVersionId`. Editar depois clona
  (deep clone via JSON) a versão publicada como a próxima `DRAFT` —
  `getOrCreateDraftVersion` é o único código-caminho que cria uma
  `FunnelVersion(DRAFT)`, garantindo no máximo uma draft ativa por funil.
- **Template seed**: `progress-reward-cod-v1` (`prisma/seed.ts`, dados em
  `modules/funnels/config/seed-templates.ts`) — rode `npm run db:seed`
  depois do `db:push`.
- **Editor desta fase**: `/[workspaceSlug]/funnels/[funnelId]` tem um
  textarea de JSON validado no servidor — rotulado como temporário; o
  editor visual vem numa fase futura.

## Storefront público (Fase 2B)

- **URL**: `/f/[publicId]/[slug]`. `publicId` (`Funnel.publicId`, aleatório,
  `crypto.randomBytes`) é o identificador de resolução real; `slug` é
  cosmético — se não bater com o slug atual do funil, a página redireciona
  para a URL canônica. Nunca usamos o slug interno (único só por workspace)
  como identificador público global.
- **Nunca serve DRAFT**: `resolvePublicFunnel` (`modules/funnels/runtime/resolve.ts`)
  só resolve quando `Funnel.status = PUBLISHED` **e** a versão referenciada
  por `publishedVersionId` também está `PUBLISHED` — checagem redundante
  deliberada. Qualquer inconsistência (config corrompido, snapshot
  ausente, versão errada) retorna `null` e a rota responde 404 — falha
  fechada, nunca vaza detalhe interno.
- **Snapshot do produto**: `FunnelProductSnapshot`, criado na publicação a
  partir do `FunnelProduct(PRIMARY)` + sua primeira variante — título,
  imagem, preço unitário e compare-at congelados. O storefront público
  nunca lê `Product`/`ProductVariant` ao vivo, então uma ressincronização
  do catálogo não muda a aparência de um funil já publicado. Preço de cada
  oferta (`OFFER` step) é `unitPrice × quantity`
  (`modules/funnels/runtime/pricing.ts`) — mecanismo simples e explícito,
  nunca inventado no frontend.
- **Runtime**: `FunnelRuntime` (client) roda um reducer puro
  (`modules/funnels/runtime/state.ts`) sobre a lista de etapas habilitadas
  do config. Navegação é controlada — `GO_TO_STEP` só aceita a etapa atual
  ou uma já completada, nunca pula à frente. Sessão fica em
  `sessionStorage` (`funnel_session:<funnelId>`), restaurada só se
  `funnelVersionId` bater com a versão publicada atual; **nenhum dado do
  formulário COD entra nesse estado** — vive só na memória local do
  react-hook-form, descartado ao avançar.
- **Nada comercial real nesta fase**: o formulário COD não faz nenhuma
  chamada de rede (simula um `await` curto e avança); a tela `SUCCESS`
  mostra explicitamente "Modo de demostración" / "No se ha creado ningún
  pedido real." — isso será removido quando o COD Engine real chegar
  (fase futura).
- **Preview de rascunho**: token HMAC assinado (`FUNNEL_PREVIEW_SECRET`,
  15 min de validade, sem persistência em banco) — `/f/preview/[token]`.
  Só quem tem `funnels:edit` consegue gerar o link; nunca é possível
  acessar um rascunho por ID previsível. A versão **publicada** não
  precisa de token — "Ver versão publicada" na página do funil só aponta
  para a própria URL pública.
- **Cache**: `unstable_cache` por `publicId`, tag `funnel-public:<publicId>`
  (mais um `revalidate: 300` de segurança). `publishFunnel` e
  `archiveFunnel` chamam `revalidateTag` — é isso que faz uma nova versão
  publicada (ou um arquivamento) começar a valer imediatamente, sem
  esperar o TTL. Preview nunca passa por essa camada.
- **CSP**: aplicada via `middleware.ts` só nas rotas `/f/*` — pragmática
  (sem nonce por request), ponto de partida documentado, não blindagem
  completa.

## Testes

```bash
npm test
```

Cobre os helpers de segurança críticos da Fase 1A (`normalizeShopDomain`,
state OAuth, HMAC, criptografia, idempotência de webhook) e da Fase 1B:
upsert idempotente de produto/variante (incluindo "full sync executado duas
vezes não duplica"), isolamento por loja, transformação Shopify → modelo
local, paginação do full sync, webhook `products/update`/`products/delete`
→ enfileiramento de job, claim/retry/backoff da fila, e transições de
`CatalogSyncRun`. Da Fase 2A: parser/discriminated union de `FunnelConfigV1`
(estrutural, incluindo rejeição de HTML/JS embutido), validação semântica
completa (PRODUCT/SUCCESS únicos, COD_FORM↔PAYMENT_CHOICE, UPSELL↔FunnelProduct,
produto cross-workspace/cross-loja rejeitado), criação de funil, optimistic
concurrency (conflito de revision), publicação (imutabilidade da versão
publicada, supersede, criação automática de v2 draft), slug e RBAC. Da Fase
2B: resolução pública (só PUBLISHED, nunca DRAFT/ARCHIVED/versão errada,
falha fechada em config inválido ou snapshot ausente), resolução por
`publicId`, `FunnelProductSnapshot` criado na publicação, reducer do
runtime (navegação, `GO_TO_STEP` nunca pula à frente, seleção de
oferta/pagamento, restore de sessão), sessão nunca contém PII, preview
(assinatura, adulteração, expiração), CSS variables de tema, `StepRenderer`
para os 7 tipos e validação visual do formulário COD (react-hook-form +
zod), com testes de componente em jsdom para os pontos de acessibilidade
viáveis nesta fase (roles, labels, `aria-live`). A Shopify é sempre mockada
— nenhum teste faz chamada real.
