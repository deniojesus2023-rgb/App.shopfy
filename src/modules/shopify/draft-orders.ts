import "server-only";

import { createShopifyGraphqlClient } from "./client";

/** Mesmo raciocínio do timeout de `orders.ts`: mutação de escrita não pode pendurar o request. */
const DRAFT_ORDER_REQUEST_TIMEOUT_MS = 15_000;

/**
 * ATENÇÃO — mesma ressalva de `orders.ts`: o sandbox onde isto foi escrito
 * bloqueia egress para shopify.dev, então o shape abaixo é a melhor
 * reconstrução a partir da documentação oficial conhecida (confirmada por
 * busca: `draftOrderCreate`, `DraftOrderLineItemInput.priceOverride`,
 * `DraftOrder.invoiceUrl`), não uma cópia verificada da doc. Antes de
 * ligar `SHOPIFY_ONLINE_CHECKOUT_ENABLED=true`: validar contra uma
 * development store seguindo o checklist do README.
 *
 * Decisões deliberadas:
 *   - `priceOverride` por line item: é ele que garante que o cliente pague
 *     EXATAMENTE o quote do nosso servidor, independente do preço de
 *     catálogo ao vivo na Shopify. É a razão de termos escolhido draft
 *     order em vez de cart permalink + discount code (que seria um DELTA
 *     contra o catálogo, e portanto sensível a qualquer mudança de preço
 *     que o lojista fizesse).
 *   - `variantId` + `quantity` física real: nunca `quantity: 1` fingindo
 *     representar N unidades, nunca quantidade codificada no título
 *     (mesma invariante da Fase 4A hardening).
 *   - `tags` carrega a identidade de reconciliação (é o único campo
 *     pesquisável em draft orders — ver online-checkout-identity.ts).
 *   - `customAttributes` carrega a MESMA identidade, porque é o que
 *     sobrevive quando o draft vira Order pago.
 *   - Nenhum bloco `customer`/endereço: o cliente preenche isso dentro do
 *     checkout da Shopify. Não coletamos PII no funil para o fluxo ONLINE.
 *
 * LIMITAÇÃO DOCUMENTADA: a doc da 2025-01 avisa que `priceOverride` não se
 * aplica a native bundles/components. Não temos como detectar isso a
 * partir do nosso catálogo sincronizado hoje (não sincronizamos metadados
 * de bundle) — está no checklist de dev store como cenário a verificar.
 */
const DRAFT_ORDER_CREATE_MUTATION = /* GraphQL */ `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface DraftOrderCreateResponse {
  draftOrderCreate: {
    draftOrder: { id: string; name: string; invoiceUrl: string | null } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export interface CreateDraftOrderInput {
  currency: string;
  /**
   * `priceOverride` é o preço UNITÁRIO — a Shopify multiplica por
   * `quantity`. A projeção vem de `buildShopifyLineItems` (Fase 4A
   * hardening), que já distribui deterministicamente um total não
   * divisível em no máximo dois grupos da mesma variante.
   */
  lineItems: Array<{ variantId: string | null; title: string; quantity: number; unitPrice: string }>;
  /** Identidade da reconciliação — vai simultaneamente em tag e custom attribute. */
  identity: string;
  /** Chave do custom attribute que carrega a identidade. */
  identityAttributeKey: string;
  note?: string;
}

export interface DraftOrderRef {
  draftOrderId: string;
  draftOrderName: string;
  invoiceUrl: string;
}

export type CreateDraftOrderOutcome =
  | { outcome: "created"; result: DraftOrderRef }
  | { outcome: "userErrors"; errors: string[] };

export async function createDraftOrder(
  shopDomain: string,
  accessToken: string,
  input: CreateDraftOrderInput
): Promise<CreateDraftOrderOutcome> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken, {
    timeoutMs: DRAFT_ORDER_REQUEST_TIMEOUT_MS,
  });

  const data = await client.request<DraftOrderCreateResponse>(DRAFT_ORDER_CREATE_MUTATION, {
    input: {
      presentmentCurrencyCode: input.currency,
      tags: ["cod-app", input.identity],
      customAttributes: [{ key: input.identityAttributeKey, value: input.identity }],
      note: input.note,
      lineItems: input.lineItems.map((item) => ({
        ...(item.variantId ? { variantId: item.variantId } : { title: item.title, requiresShipping: true }),
        quantity: item.quantity,
        priceOverride: { amount: item.unitPrice, currencyCode: input.currency },
      })),
    },
  });

  const { draftOrder, userErrors } = data.draftOrderCreate;
  if (userErrors.length > 0 || !draftOrder) {
    return { outcome: "userErrors", errors: userErrors.map((e) => e.message) };
  }
  if (!draftOrder.invoiceUrl) {
    // Sem invoiceUrl não existe checkout para mandar o cliente — falha
    // fechada em vez de devolver um botão que não leva a lugar nenhum.
    return { outcome: "userErrors", errors: ["Draft order criado sem invoiceUrl."] };
  }

  return {
    outcome: "created",
    result: { draftOrderId: draftOrder.id, draftOrderName: draftOrder.name, invoiceUrl: draftOrder.invoiceUrl },
  };
}

// `first: 5` (e não 1) pelo mesmo motivo da reconciliação de pedidos da
// Fase 3: precisamos DISTINGUIR "nenhum" de "exatamente um" de "mais de
// um" — com `first: 1` uma duplicata seria invisível.
const FIND_DRAFT_ORDERS_BY_TAG_QUERY = /* GraphQL */ `
  query FindDraftOrdersByTag($query: String!) {
    draftOrders(first: 5, query: $query) {
      edges {
        node {
          id
          name
          invoiceUrl
        }
      }
    }
  }
`;

interface FindDraftOrdersResponse {
  draftOrders: { edges: Array<{ node: { id: string; name: string; invoiceUrl: string | null } }> };
}

/**
 * Reconciliação: procura draft orders já criados com a nossa identidade,
 * para a janela "criamos na Shopify → resposta se perdeu → retry".
 * Retorna a lista completa (até 5) para o caller decidir — 0 libera nova
 * criação, 1 reutiliza, >1 é duplicata que precisa de decisão humana.
 *
 * `tag:` é o anchor porque draft orders não expõem `sourceIdentifier`
 * (ver online-checkout-identity.ts). Mesma limitação conhecida da Fase 3:
 * passa pelo índice de busca da Shopify, sem garantia contratual de
 * leitura-após-escrita imediata.
 */
export async function findDraftOrdersByIdentity(
  shopDomain: string,
  accessToken: string,
  identity: string
): Promise<DraftOrderRef[]> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken, {
    timeoutMs: DRAFT_ORDER_REQUEST_TIMEOUT_MS,
  });

  const data = await client.request<FindDraftOrdersResponse>(FIND_DRAFT_ORDERS_BY_TAG_QUERY, {
    query: `tag:'${identity}'`,
  });

  return data.draftOrders.edges
    .filter((edge) => edge.node.invoiceUrl)
    .map((edge) => ({
      draftOrderId: edge.node.id,
      draftOrderName: edge.node.name,
      invoiceUrl: edge.node.invoiceUrl!,
    }));
}
