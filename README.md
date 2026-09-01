# App.shopfy

SaaS multi-tenant para funis de vendas gamificados conectados a lojas Shopify.
Este repositório contém a **Fase 0** (fundação, autenticação, workspaces,
RBAC, auditoria), a **Fase 1A** (conexão de loja Shopify via OAuth + webhooks),
a **Fase 1B** (fila persistente + importação/sincronização de catálogo), a
**Fase 2A** (motor de configuração de funis: draft/versão/publicação), a
**Fase 2B** (storefront público + runtime de funil em `/f/[publicId]/[slug]`),
a **Fase 2C** (Funnel Builder MVP — editor visual), a **Fase 3** (COD Engine
+ Order Engine + criação de pedido na Shopify) e a **Fase 4A** (Pricing &
Offer Engine — preço fixo por oferta, ver seção própria abaixo).
Pagamento online real, fornecedores/dropshipping, gamificação real, WhatsApp,
recuperação de carrinho, domínio próprio, antifraude sofisticado e order
editing de upsell ainda não foram implementados.

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
- **Editor visual**: o textarea de JSON temporário foi substituído pelo
  Funnel Builder (ver Fase 2C) — `/[workspaceSlug]/funnels/[funnelId]/builder`.

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
- **COD real a partir da Fase 3**: o formulário COD chama
  `POST /api/storefront/orders` de verdade — ver seção própria abaixo. A
  tela `SUCCESS` só afirma que o pedido existe depois que o Order local foi
  criado (nunca antes, nunca inventa número de pedido).
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

## Funnel Builder MVP (Fase 2C)

- **`FunnelConfigV1` continua sendo a única fonte de verdade**: o builder
  não introduz um segundo modelo de estado — cada editor lê/escreve
  diretamente pedaços do mesmo config que os módulos de Fase 2A/2B já
  entendem. Não há drag-and-drop livre, COD real, pedidos Shopify,
  pagamentos reais, gamification engine, fornecedores, WhatsApp, domínios
  próprios ou novos tipos de step nesta fase.
- **Layout**: desktop usa três colunas fixas (lista de etapas | painel de
  propriedades | preview) — não é um clone de Figma/Canva, é
  "orientado a propriedades". Mobile usa as mesmas três áreas como abas
  (nunca três colunas espremidas).
- **Estado**: `useReducer` simples (`components/builder/builder-state.ts`,
  `BuilderState`/`builderReducer`) — sem Redux/Zustand. Guarda
  `originalConfig`, `draftConfig`, `revision`, seleção atual, `dirty` e o
  status de salvamento. Reordenar etapas é só via botões ▲/▼
  (`renumberOrders` sempre renumera `order` 0..N-1 pela ordem *posicional*
  atual do array — nunca reordena pelo `order` antigo, ou desfaria o swap
  que acabou de acontecer).
- **8 editores por tipo de etapa** (`components/builder/editors/*`), todos
  controlados e validados pelo shape do Zod existente — nenhum estado novo
  duplicado. Regras notáveis: `PaymentChoiceEditor` desabilita o checkbox
  do único método ainda ativo (nunca deixa o usuário zerar os dois, o que
  o `.refine()` do schema rejeitaria de qualquer forma); `CodFormEditor`
  reordena campos livremente (o schema já suporta ordem por array) e só
  mostra "Obrigatório" quando o campo está habilitado; `OfferStepEditor`
  mostra o preço (`unitPrice × quantity`, de `runtime/pricing.ts`) como
  somente leitura, com um TODO explícito para a futura Pricing Engine —
  nunca editável manualmente aqui; `UpsellEditor` só permite associar um
  produto da mesma `ShopifyStore` do funil (`setUpsellProductAction`
  rejeita cross-store/cross-workspace no servidor, é a autoridade real).
- **Preview = mesmo renderer do storefront**: `PreviewPanel` monta um
  `ResolvedFunnel` inteiramente em memória (nunca uma chamada de rede) e
  renderiza com o mesmíssimo `FunnelRuntime`/`StepRenderer` da Fase 2B —
  "um renderer, uma fonte de verdade". Para isso, `FunnelRuntime` ganhou
  `forcedStepId` (pula a checagem de navegação do visitante, só usado
  aqui) e `disableSessionPersistence` (o preview nunca lê/escreve
  `sessionStorage`). Nenhum endpoint público novo foi criado — o preview
  vive dentro da rota autenticada do builder.
- **Validação em duas camadas, sem funções novas no servidor**: salvar
  draft continua exigindo só validação estrutural (Zod, via
  `updateDraftConfig`, inalterado); publicar continua exigindo também
  `validateFunnelSemantics` (inalterada). O builder só passou a rodar essa
  mesma função pura também no cliente (`workspaceId: "self"`, deliberado —
  é só UX/gating), para popular o resumo de erros e bloquear o botão
  "Publicar" antes de bater no servidor, que segue sendo a autoridade
  final.
- **Salvar é manual** ("Guardar cambios") — sem autosave. Envia o config +
  a `revision` esperada; em conflito de concorrência otimista
  (`ActionResult.code === "CONFLICT"`, novo campo em `action-result.ts`)
  mostra um modal ("Este embudo fue modificado en otra sesión.") com duas
  opções explícitas — recarregar a página ou continuar editando local —
  nunca faz merge automático.
- **RBAC**: `funnels:view` só lê, `funnels:edit` pode editar o draft,
  `funnels:publish` pode publicar — a UI esconde/desabilita controles
  conforme a permissão, mas o servidor (`requireWorkspacePermission` em
  cada Server Action) continua sendo a autoridade.
- **Auditoria**: sem eventos novos — continua usando
  `FUNNEL_DRAFT_UPDATED`/`FUNNEL_PUBLISHED` (Fase 2A), disparados só em
  save/publish reais, nunca por tecla digitada.
- **Fluxo de criação**: `/[workspaceSlug]/funnels/new` virou um wizard
  (Loja → Produto → Plantilla → Nome) que, ao concluir, abre o builder do
  funil recém-criado diretamente — não mais a página de resumo.

## COD Engine + Order Engine + Shopify Order Creation (Fase 3)

Primeira fase transacional do storefront: o `COD_FORM` deixa de ser
demonstração e passa a criar um pedido real. **Nossa aplicação é a
autoridade inicial da venda — a Shopify é downstream.** Uma instabilidade
temporária da Shopify nunca faz o cliente perder o pedido.

> ⚠️ **Aviso sobre `orderCreate`**: o ambiente onde esta fase foi
> desenvolvida bloqueia egress para `shopify.dev`, então o shape da mutação
> em `modules/shopify/orders.ts` não pôde ser reconferido contra a
> documentação ao vivo — é a melhor reconstrução por conhecimento treinado
> da Admin GraphQL API pinned (`SHOPIFY_API_VERSION`, `modules/shopify/client.ts`).
> **Valide contra a doc oficial num dev store antes de setar
> `SHOPIFY_ORDER_SYNC_ENABLED=true` em produção.**

- **Pedido local primeiro, Shopify depois**: `submitCheckout`
  (`modules/orders/service.ts`) roda inteiramente numa `prisma.$transaction`
  — cria `CodLead` + `Order` + `OrderItem` + `OrderStatusHistory` + enfileira
  o job `SHOPIFY_ORDER_CREATE` (via `enqueueJobInTx`, mesma conexão
  Postgres) — e só depois retorna a confirmação ao cliente. Nunca existe
  "Order criado, job perdido": ou tudo commita, ou nada.
- **PII só em `CodLead`**: `Order`/`OrderItem`/`OrderStatusHistory` nunca
  carregam nome/telefone/endereço. O payload do job é `{ orderId }` —o
  worker carrega o `CodLead` do banco quando precisa. `redactOrderFields`
  (`modules/shared/redact.ts`) é a allowlist usada por qualquer log/erro
  relacionado a pedido.
- **`OrderStatus` × `ShopifySyncStatus`**: dois eixos independentes.
  `OrderStatus` (PENDING/CONFIRMED/CANCELLED/FULFILLED/DELIVERED/REFUSED) é
  a verdade comercial — nunca setado pelo worker Shopify, exceto
  cancelamento/fulfillment reconciliados via webhook. `ShopifySyncStatus`
  (PENDING/SYNCING/SYNCED/FAILED/REAUTH_REQUIRED) é só o estado da
  integração — `Order.status = PENDING` **nunca** significa que a
  sincronização falhou.
- **Servidor é a única autoridade de preço**: `POST /api/storefront/orders`
  (`modules/orders/service.ts`) resolve `Funnel PUBLISHED` → `FunnelVersion`
  elegível → `parseFunnelConfig` → `FunnelProductSnapshot` → valida
  offer/quantity/COD/campos obrigatórios → `calculateOrderQuote()`
  (`modules/orders/pricing.ts`, V1 = `unitPrice × quantity`, sem desconto/
  frete, mas já é o único ponto de cálculo — pronto para uma Pricing Engine
  futura). O client nunca envia preço/total/discount/moeda; enviar
  `selectedQuantity` é ignorado quando há etapa `OFFER` — a quantidade real
  vem sempre da oferta configurada no servidor.
- **Idempotência local**: `checkoutAttemptId` (UUID gerado 1x no runtime,
  não é PII, vive em `sessionStorage`) deriva `Order.idempotencyKey`
  (`UNIQUE`). Duplo clique ou reenvio com o mesmo attempt sempre retorna o
  mesmo Order — nunca cria um segundo, inclusive numa corrida real (dois
  `POST`s simultâneos: a constraint UNIQUE decide, o perdedor recebe o
  Order do vencedor via `P2002`).
- **Version race**: `FunnelVersion.supersededAt` é setado quando o lojista
  publica uma versão nova. `isVersionEligibleForCheckout`
  (`modules/orders/version-window.ts`) aceita a versão `PUBLISHED` atual OU
  uma `SUPERSEDED` há menos de 20 minutos (`VERSION_RACE_GRACE_MS`) — nunca
  DRAFT/ARCHIVED, nunca uma versão antiga vendável indefinidamente.
- **Dinheiro**: `Decimal(12,2)` no banco (mesmo padrão de
  `ProductVariant.price`), `roundMoney`/`formatMoney`
  (`modules/shared/money.ts`) em memória — nunca `unitPrice * quantity`
  solto fora de `calculateOrderQuote`. Moeda vem de `ShopifyStore.currency`
  (lida de `shop.currencyCode` na conexão OAuth), com fallback `"COP"` —
  primeiro mercado sem travar a arquitetura a um único país.
- **`SHOPIFY_ORDER_CREATE` (job)**: claim → já sincronizado? completa
  idempotente → `SHOPIFY_ORDER_SYNC_ENABLED=false`? no-op controlado (nunca
  chama a Shopify em dev/test por padrão) → loja desconectada/token
  inválido → `REAUTH_REQUIRED` (Order e loja), não-retryable → busca por
  reconciliação (`findShopifyOrderByInternalTag`, tag
  `internal_order_<id>`, sem `:`) antes de criar → `createShopifyOrder`
  (`modules/shopify/orders.ts`) com **custom line items** (preço exato do
  nosso quote, nunca o preço vivo do Product) e `financialStatus: PENDING`
  sempre (nunca `PAID` — é COD). `userErrors` → `FAILED`, não-retryable.
  Throttle/timeout/5xx sobem e a fila retenta com backoff; se as tentativas
  se esgotarem, o cron marca `shopifySyncStatus = FAILED` explicitamente
  (nunca fica preso em SYNCING para sempre).
- **Idempotência externa (Shopify)**: `orderCreate` não tem idempotency key
  nativa, então a identidade é o **`sourceIdentifier`**
  (`appshopfy_order_<Order.id>`, `modules/orders/shopify-identity.ts`) —
  campo documentado para "ID no sistema de origem", filtrável por
  `source_identifier:` na query `orders`, namespaced e sem PII. A tag
  `internal_order_<id>` continua sendo enviada, mas **só como apoio visual
  ao lojista**: tag é editável pela UI da Shopify e por outros apps, então
  nunca decide identidade.
  A regra de reconciliação usa um marcador durável: `shopifySyncStatus =
  SYNCING` é gravado **antes** de qualquer byte sair, então `PENDING` prova
  que nenhuma criação foi tentada (cria direto, sem gastar consulta) e
  qualquer outro estado obriga a consultar `source_identifier` antes de
  criar. Resultado da consulta: **0** libera o retry normal, **1**
  reconcilia (`shopifyOrderId`/`shopifyOrderName`/`SYNCED`, sem segundo
  `orderCreate`), **>1** falha fechado em `ShopifySyncStatus.MANUAL_REVIEW`
  — nunca cria outro pedido nem escolhe um candidato sozinho, e emite log
  operacional sem PII. É isso que fecha a corrida "worker criou na Shopify →
  resposta se perdeu → worker morreu → job recuperado por outro worker".
  *Risco residual honesto:* a consulta passa pelo índice de busca da
  Shopify, que não garante contratualmente leitura-após-escrita imediata;
  na prática ela só roda na tentativa seguinte (backoff ≥ 30s, ou 5 min no
  caso de job órfão), bem longe da escrita.
- **Classificação de falha** (`classifyShopifyFailure`): `401` e
  `userErrors` são definitivos (nada criado) → não-retryable; throttle e
  `4xx` são **seguros** → status volta a `PENDING` e a próxima tentativa
  pula a consulta; timeout (`ShopifyTimeoutError`, o cliente de pedidos usa
  `AbortSignal` explícito), `5xx`, falha de transporte e qualquer erro
  desconhecido são **ambíguos** → status permanece `SYNCING`, obrigando a
  reconciliação antes de qualquer nova criação. O default de um erro
  não classificado é sempre "ambíguo".
- **Fidelidade do quote**: line items são custom (sem `variantId`), com
  `priceSet` = preço **unitário** (`Decimal.toFixed(2)`) no dinheiro da
  loja — a Shopify multiplica por `quantity` e não tem de onde buscar um
  preço "atual" do produto. Antes de criar, o worker confere que
  Σ(unitPrice × quantity) bate com `Order.total`; se não bater (um quote
  futuro com frete/desconto, por exemplo), falha fechado em vez de criar
  na Shopify um pedido com valor diferente do que o cliente aceitou.
- **Webhook reconciliation**: `orders/create` identifica pedido nosso pelo
  `source_identifier` (tag só como fallback para pedidos anteriores a esta
  estratégia) e distingue de pedido criado direto na Shopify —
  este último nunca é importado, só marcado como evento externo conhecido.
  `orders/updated` fica travado em cancelamento e fulfillment, sempre
  gerando `OrderStatusHistory(source: SHOPIFY)`.
- **Anti-abuse básico**: `checkRateLimit` (já usado pelo endpoint de
  webhook) aplicado por IP+funil e por IP global; limite de corpo (8KB);
  honeypot oculto (preenchido ⇒ erro genérico, nunca denuncia detecção).
  Sem CAPTCHA nesta fase.
- **Dev/test seguro por padrão**: `SHOPIFY_ORDER_SYNC_ENABLED` (env var,
  default `"false"`) — sem ele, o worker nunca chama a Shopify de verdade,
  mesmo com o resto do fluxo rodando normalmente. `npm test` nunca cria
  pedido real (Shopify sempre mockada).
- **Admin**: `/[workspaceSlug]/orders` (lista, filtro por status, busca por
  `orderNumber`) e `/[workspaceSlug]/orders/[orderId]` (detalhe: dados do
  pedido, itens, cliente/endereço, histórico, integração Shopify) —
  tenant-scoped por `modules/orders/admin/service.ts`. Permissões novas:
  `orders:view` (todos os papéis) e `orders:manage` (OWNER/ADMIN).
- **Upsell continua não-transacional**: o `Order` já foi criado antes do
  `UPSELL` no fluxo `SUCCESS → UPSELL` — esta fase não edita o Order real
  a partir da decisão de upsell (fase própria futura).

## Pricing & Offer Engine (Fase 4A)

Remove a dependência de `unitPrice × quantity` como única forma de
precificar uma oferta — cada `OFFER` do funil agora carrega sua própria
regra comercial (`PricingRule`), validada no servidor, congelada com a
versão publicada e usada de ponta a ponta (Builder, storefront,
`calculateOrderQuote`, criação de pedido na Shopify).

- **Três conceitos separados, nunca confundidos**: preço de **catálogo**
  (`ProductVariant.price`, sincronizado da Shopify — nunca sobrescrito),
  preço de **oferta do funil** (`PricingRule`, publicado no config), e
  **quote do pedido** (`calculateOrderQuote`, calculado pelo servidor no
  momento da compra a partir dos dois anteriores). Editar uma oferta nunca
  reescreve o catálogo; recomprar uma versão antiga nunca recalcula com o
  preço atual do Product — sempre o `FunnelProductSnapshot` congelado
  daquela versão.
- **`PricingRule`** (`modules/funnels/config/pricing-rule.ts`), união
  discriminada extensível — só dois tipos implementados nesta fase:
  `UNIT_MULTIPLIER` (`unitPrice × quantity`, o comportamento histórico) e
  `FIXED_TOTAL` (o lojista define o total do pacote; pode ser maior que a
  referência — sobretaxa permitida, só avisada no Builder, nunca
  bloqueada). Nada de tier pricing genérico, Buy X Get Y, cupons ou
  fórmulas customizadas ainda.
- **`FunnelConfigV2`**: `pricing` passa a ser obrigatório em cada offer —
  mudança estrutural, não aditiva, então usa de verdade a infraestrutura
  de migração criada (e nunca chamada) na Fase 2A. `migrateFunnelConfig`
  ganhou sua primeira migração real (`1 -> 2`): toda oferta v1 sem
  `pricing` vira `UNIT_MULTIPLIER` (comportamento idêntico ao que já
  tinha). `parseFunnelConfig` sempre devolve o shape ATUAL — parseia com
  o schema histórico, migra em memória, revalida com o schema atual — e é
  o único lugar que sabe disso; todo o resto do app (`FunnelConfig` =
  alias de `FunnelConfigV2`) só enxerga o shape corrente.
- **Nenhuma `FunnelVersion` `PUBLISHED` histórica é reescrita**: uma
  versão publicada antes desta fase continua com `configSchemaVersion=1`
  e o JSON original no banco para sempre — toda leitura migra em memória.
  Só dois pontos gravam v2 de propósito: `updateDraftConfig` (todo save
  de draft canoniza — corrigido um bug real encontrado ao implementar
  isto: a coluna `configSchemaVersion` não acompanhava o JSON já migrado)
  e `publishFunnel` (a transição DRAFT→PUBLISHED canoniza o config no
  exato momento em que a versão nasce — não é "mutar uma PUBLISHED
  histórica", é o próprio nascimento dela).
- **Núcleo de pricing compartilhado, nunca duplicado**: `resolveOfferPrice`
  (`modules/funnels/pricing/resolve-offer-price.ts`) é puro, sem I/O, e é
  a MESMA função usada pelo preview do Builder (economia mostrada ao
  lojista), pelo storefront (`OFFER`/`PRODUCT` steps) e por
  `calculateOrderQuote` no servidor — elimina a duplicação que já existia
  antes desta fase (`runtime/pricing.ts` tinha sua própria
  `computeOfferPrice`/`formatPrice` paralela; removido). O servidor
  continua sendo a única autoridade sobre o que é cobrado.
- **`calculateOrderQuote` nunca recebe `quantity` do client** — só
  `selectedOfferId`; a quantidade e a regra de preço vêm sempre da oferta
  publicada correspondente. `selectedQuantity` foi removido do schema
  público (`POST /api/storefront/orders`) — não é mais nem aceito.
  `OrderItem.unitPrice` é o preço unitário EFETIVO (`total/quantity`,
  arredondado — informativo), nunca usado para reconstituir o total; isso
  é sempre `OrderItem.lineTotal`, exato, sem divisão.
- **Mapeamento para a Shopify preserva quantidade física E dinheiro exato**
  (`modules/orders/shopify-line-items.ts`). Uma primeira versão desta fase
  mandava todo line item como `quantity: 1` com `unitPrice = lineTotal` e a
  quantidade comercial só no título: preservava o total, mas destruía a
  semântica de quantidade — inventory, fulfillment, picking, refunds e
  relatórios passavam a "ver" 1 unidade vendida quando foram 3, e título
  virava campo de integração. Substituído por **distribuição determinística
  de centavos** entre as unidades físicas: distribuindo `totalCents` por
  `quantity` unidades cada uma recebe `base` ou `base + 1` centavos, o que
  colapsa em no máximo DOIS line items da mesma variante.

  ```
  149.900 em 3 unidades → 2 × 49.966,67 + 1 × 49.966,66 = 149.900,00
                          quantidade física total = 3
  ```

  Invariantes garantidas por construção e verificadas em teste:
  `Σ quantity === OrderItem.quantity` e
  `Σ (quantity × unitPrice) === OrderItem.lineTotal`. Quando o total divide
  exato (todo `UNIT_MULTIPLIER` e a maioria dos `FIXED_TOTAL`), o resto é
  zero e sai UM line item com a quantidade real — nenhum split
  desnecessário. O título voltou a ser apresentação pura.
- **Identidade da variante congelada na publicação**: `publishFunnel` já
  escolhia uma variante concreta para ler o preço (primeira por `position`,
  não deletada) mas descartava a identidade dela. Agora
  `FunnelProductSnapshot` congela também `productVariantId`,
  `shopifyProductId`, `shopifyVariantId`, `variantTitle` e `sku`, que o
  checkout copia para o `OrderItem` (colunas que já existiam no schema e
  nunca eram preenchidas). Com isso o line item da Shopify vai com
  `variantId` real — pedido de produto real, não item avulso — e a futura
  `SupplierOrder` lê `OrderItem.productVariantId` + `OrderItem.quantity`
  direto, sem interpretar texto. Campos nullable: snapshots publicados
  antes disso continuam válidos e caem em custom line item, ainda com a
  quantidade real. Nenhuma migração destrutiva de versão publicada.
- **`priceSet` vai sempre junto com `variantId`** — é o que impede a
  Shopify de recalcular o preço a partir do catálogo ao vivo. Essa
  precedência está marcada em `modules/shopify/orders.ts` como item a
  validar num dev store antes de ligar `SHOPIFY_ORDER_SYNC_ENABLED`: se
  não se confirmar, a saída é voltar a omitir `variantId`, nunca aceitar
  cobrar valor diferente do que o cliente aceitou.
- **Duas checagens de fidelidade antes de tocar a rede**: a da Fase 3
  corrigida para `Σ lineTotal === Order.total` (nunca
  `Σ unitPrice × quantity`, que ficaria instável com desconto) e uma nova
  sobre a projeção — `Σ (unitPrice × quantity) dos line items` tem que
  reproduzir `Order.total` no centavo. Ambas falham fechado.
- **Money**: reaproveita a estratégia da Fase 3 (`Decimal(12,2)`,
  `roundMoney`) sem criar segunda implementação — adiciona só
  `multiplyMoney`/`compareMoney` e `formatMoneyForDisplay(value, currency)`
  para EXIBIÇÃO (não assume 2 casas para toda moeda: CLP mostra 0 casas,
  por exemplo). O wire format para a Shopify e o storage continuam fixos
  em 2 casas — decisão da Fase 3 mantida (a Shopify exige isso mesmo para
  moeda zero-decimal).
- **Oferta predeterminada** (`defaultOfferId`): alimenta só o preço
  mostrado no `PRODUCT step` antes do visitante chegar em `OFFER` — nunca
  pré-seleciona nada na etapa `OFFER` em si nem dispensa escolha explícita
  na submissão. Um bundle de mais de 1 unidade compara com a referência do
  PACOTE, nunca com o preço unitário do produto.
- **Builder**: `OfferStepEditor` ganhou toggle "Precio automático"/"Precio
  fijo", mostrando ao vivo Precio de referencia / Precio de oferta /
  Ahorras (derivados, nunca escritos pelo lojista), aviso não-bloqueante
  quando o preço fixo é maior que a referência, e um seletor de oferta
  predeterminada. Moeda vem sempre de `ShopifyStore.currency` — nunca
  escolhida à mão.

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
viáveis nesta fase (roles, labels, `aria-live`). Da Fase 2C: reducer do
builder (`builder-state.ts` — dirty, save success/error/conflict,
`DISMISS_CONFLICT` sem merge, `MOVE_STEP`/renumeração de `order` sem
lacunas nem duplicatas), isolamento tenant de `searchStoreProductsAction`,
rejeição cross-store/cross-workspace e substituição (não acumulação) de
`setUpsellProductAction`, mapeamento erro-semântico→etapa
(`validation-mapping.ts`), editores de `OFFER` (preço somente leitura,
add/remover/reordenar), `PAYMENT_CHOICE` (nunca zera os dois métodos),
`COD_FORM` (obrigatório implica habilitado, quick-add só lista campos
ausentes), `SUCCESS` e `ThemeEditor`/`ColorField` (validação de hex), e um
teste de integração do `FunnelBuilder` (dirty state, save com sucesso,
modal de conflito com as duas opções, `Publicar` bloqueado com erro
semântico, modo somente leitura). `PreviewPanel` é testado confirmando que
renderiza pelo mesmo `FunnelRuntime`/`StepRenderer` do storefront público —
não um mock separado. A Shopify é sempre mockada — nenhum teste faz
chamada real.

Os testes de componente (`*.test.tsx`, ambiente jsdom) e os de lógica pura
(`*.test.ts`, ambiente node) rodam juntos neste mesmo comando —
`vitest.config.ts` inclui as duas extensões e registra o `cleanup()` do
Testing Library em `afterEach` (`src/test/setup-jsdom.ts`), já que
`test.globals` fica desligado neste projeto.

Da Fase 3: `calculateOrderQuote` (V1, arredondamento de centavos),
`isVersionEligibleForCheckout` (PUBLISHED, SUPERSEDED dentro/fora da
janela, DRAFT sempre rejeitado, funil errado rejeitado), `submitCheckout`
de ponta a ponta (funil inexistente/DRAFT/ARCHIVED rejeitado, versão
inelegível rejeitada, COD desabilitado rejeitado, ONLINE rejeitado, oferta
inválida rejeitada, `selectedQuantity` do client ignorado, campo COD
obrigatório exigido mesmo se o client omitir, idempotência por
`checkoutAttemptId` — mesmo attempt nunca duplica, attempt diferente cria
Order separado, corrida real via `P2002` nunca duplica —, transação
atômica CodLead+Order+OrderItem+OrderStatusHistory+BackgroundJob, job
minimalista sem PII, resposta pública sem IDs internos), o job
`SHOPIFY_ORDER_CREATE` (idempotente, respeita `SHOPIFY_ORDER_SYNC_ENABLED
=false`, `sourceIdentifier` enviado e sem PII, primeira tentativa não gasta
consulta, retry após falha ambígua reconcilia por `source_identifier` antes
de criar, pedido existente não gera segundo `orderCreate`, zero resultados
libera retry, múltiplos resultados falham fechado em `MANUAL_REVIEW` com
log sem PII, timeout após criação remota é reconciliado na tentativa
seguinte, quote não representável falha antes de tocar a Shopify,
`userErrors` não-retryable, `ShopifyAuthError` → `REAUTH_REQUIRED`
não-retryable, throttle volta a `PENDING` e sobe para retry da fila, loja
desconectada falha sem tentar rede), `classifyShopifyFailure`
(safe × ambíguo para throttle/4xx/timeout/5xx/transporte),
`createShopifyOrder`/`findShopifyOrdersBySourceIdentifier` (nunca `PAID` e
nunca `transactions`, custom line items com preço unitário exato do quote,
identidade independente da tag, `first` > 1 para detectar duplicata,
`userErrors` retornado em vez de lançar), `orderSourceIdentifier`
(estável, namespaced, sem PII, seguro para a sintaxe de busca),
`reconcileOrderCreatedWebhook`/
`reconcileOrderUpdatedWebhook` (pedido nosso vs. externo nunca duplicado,
`source_identifier` com precedência sobre a tag, fallback por tag
preservado, cancelamento/fulfillment geram `OrderStatusHistory(source:
SHOPIFY)`),
isolamento de tenant do admin de pedidos, `enqueueJobInTx` aceitando um
`tx` de transação (não só o `prisma` singleton), `redactOrderFields`
(allowlist, PII nunca escapa) e RBAC `orders:view`/`orders:manage`. Toda
chamada à Shopify é sempre mockada — nenhum teste cria pedido real.

Da Fase 4A: `resolveOfferPrice` (UNIT_MULTIPLIER sem desconto, FIXED_TOTAL
com desconto/igual/sobretaxa derivados matematicamente, nunca escritos à
mão) e `savingsPercent` (null quando não há desconto real); `pricingRuleSchema`
(amount ausente/zero/negativo/NaN/Infinity/float impreciso/acima do teto
rejeitados); `migrateFunnelConfig` V1→V2 (injeta `pricing: UNIT_MULTIPLIER`
em toda oferta antiga, preserva os demais campos e etapas não-OFFER
intocadas, rejeita downgrade, erro em migração não registrada);
`parseFunnelConfig` sempre retornando o schema atual (V2) — direto quando
`configSchemaVersion=2`, via migração + revalidação quando `=1`; `calculateOrderQuote`
com a nova assinatura (`productSnapshot`/`offer`/`currency`, sem
`quantity` do client), incluindo o caso FIXED_TOTAL não divisível
igualmente pela quantidade; `submitCheckout` ignorando `selectedQuantity`
manipulado no payload bruto (o campo não existe mais no schema/tipo) e
derivando a quantidade sempre da oferta resolvida no servidor; o job
`SHOPIFY_ORDER_CREATE` e a projeção de line items
(`distributeLineTotal`/`buildShopifyLineItems`): casos divisíveis saem numa
única linha sem split, `149.900 em 3 unidades` distribui centavos
preservando quantidade física 3 e total exato, nunca mais de dois grupos
por item, soma exata verificada por varredura de várias quantidades e
totais, ordem determinística, quantidade inválida rejeitada, `variantId`
preservado em todas as linhas do split, snapshot antigo sem variante ainda
preserva a quantidade real, título nunca carrega quantidade, e a checagem
de fidelidade por `Σ lineTotal` (não mais `unitPrice × quantity`) somada à
nova invariante de que a projeção reproduz `Order.total` no centavo;
congelamento da identidade da variante na publicação e sua propagação
snapshot → quote → `OrderItem`; `OfferStepEditor` (alternância Preço automático/fixo, seed do
campo fixo com a referência ao trocar de tipo, exibição de referência/oferta/economia
só quando há desconto real, aviso não-bloqueante quando o preço fixo supera
a referência, seleção de `defaultOfferId` restrita a ofertas existentes);
`ProductStepView`/`OfferStepView` (preço/`compareAtPrice` sempre via
`resolveOfferPrice`, nunca calculado inline; bundle com `defaultOfferId`
comparado contra a referência do próprio pacote, nunca contra o
`compareAtPrice` de 1 unidade do snapshot; comportamento sem `OFFER`/sem
`defaultOfferId` preservado idêntico ao pré-Fase 4A); `formatMoneyForDisplay`/
`multiplyMoney`/`compareMoney` (moedas de 2 casas, CLP/zero-decimal,
moeda desconhecida com fallback seguro, case-insensitive) — a codificação
para a Shopify e a coluna no banco continuam fixas em 2 casas decimais,
como já decidido na Fase 3; e, no `admin/service.ts`, a canonização de
`configSchemaVersion` para a versão atual tanto ao salvar um draft V1
(`updateDraftConfig`) quanto ao publicá-lo (`publishFunnel`) — corrigindo um
bug latente em que o JSON migrava para V2 mas a coluna de versão ficava
parada em 1. Nenhuma versão publicada histórica é reescrita: só a
transição DRAFT→PUBLISHED e o salvamento de draft canonizam a linha.
