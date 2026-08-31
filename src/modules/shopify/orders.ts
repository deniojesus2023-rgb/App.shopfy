import "server-only";

import { createShopifyGraphqlClient } from "./client";

/**
 * Tempo limite explícito para as chamadas de pedido. Uma conexão pendurada
 * numa MUTAÇÃO DE ESCRITA precisa virar `ShopifyTimeoutError` (tratado como
 * resultado ambíguo pelo worker) em vez de segurar o worker até a
 * plataforma matar a função — o que deixaria o job órfão sem nenhuma
 * classificação de erro registrada.
 */
const ORDER_REQUEST_TIMEOUT_MS = 15_000;

/**
 * ATENÇÃO — mutação não reconferida contra a documentação ao vivo desta
 * fase: o sandbox onde isto foi escrito bloqueia egress para shopify.dev,
 * então o shape abaixo é a melhor reconstrução por conhecimento treinado
 * do Admin GraphQL API (`orderCreate`, versão pinned em `client.ts`), não
 * uma cópia verificada da doc. Antes de setar `SHOPIFY_ORDER_SYNC_ENABLED
 * =true` em produção: validar este mutation shape contra
 * https://shopify.dev/docs/api/admin-graphql/<versão>/mutations/orderCreate
 * num dev store real. Decisões deliberadas para reduzir risco:
 *   - `sourceIdentifier` carrega a identidade do nosso Order (é o campo
 *     documentado para "ID no sistema de origem", e o único filtrável por
 *     `source_identifier:` na query `orders`) — base da reconciliação.
 *   - `lineItems` são "custom line items" (sem `variantId`) — o preço vem
 *     sempre do nosso `calculateOrderQuote()`, nunca do Product ao vivo
 *     sincronizado na Shopify.
 *   - `financialStatus: PENDING` sempre, e NENHUM bloco `transactions`:
 *     COD não é pago no checkout, então não existe transação de sucesso
 *     para registrar. Nunca simulamos pagamento.
 *   - Sem bloco `customer` (evita a ambiguidade de "associar vs criar
 *     cliente" que não pude confirmar) — nome/telefone vão em
 *     `shippingAddress`/`phone` apenas.
 */
const ORDER_CREATE_MUTATION = /* GraphQL */ `
  mutation OrderCreate($order: OrderCreateOrderInput!) {
    orderCreate(order: $order) {
      order {
        id
        name
        createdAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface OrderCreateResponse {
  orderCreate: {
    order: { id: string; name: string; createdAt: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export interface CreateShopifyOrderInput {
  currency: string;
  /**
   * Preço UNITÁRIO por item, já formatado com 2 casas. A Shopify multiplica
   * por `quantity` — enviar o total da linha aqui cobraria a mais.
   */
  lineItems: Array<{ title: string; quantity: number; unitPrice: string }>;
  /** Identidade da reconciliação (modules/orders/shopify-identity.ts). */
  sourceIdentifier: string;
  /** Apoio visual para o lojista — nunca usado como identidade. */
  internalOrderTag: string;
  note?: string;
  phone?: string;
  shippingAddress: {
    firstName: string;
    address1: string;
    city: string;
    province?: string;
    country: string;
    phone?: string;
  };
}

export interface ShopifyOrderRef {
  shopifyOrderId: string;
  shopifyOrderName: string;
  shopifyCreatedAt: string;
}

export type CreateShopifyOrderOutcome =
  | { outcome: "created"; result: ShopifyOrderRef }
  | { outcome: "userErrors"; errors: string[] };

export async function createShopifyOrder(
  shopDomain: string,
  accessToken: string,
  input: CreateShopifyOrderInput
): Promise<CreateShopifyOrderOutcome> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken, {
    timeoutMs: ORDER_REQUEST_TIMEOUT_MS,
  });

  const data = await client.request<OrderCreateResponse>(ORDER_CREATE_MUTATION, {
    order: {
      currency: input.currency,
      financialStatus: "PENDING",
      sourceIdentifier: input.sourceIdentifier,
      tags: ["cod", input.internalOrderTag],
      note: input.note,
      phone: input.phone,
      lineItems: input.lineItems.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        // priceSet = preço unitário no dinheiro da loja. É o que preserva o
        // quote calculado pelo NOSSO servidor: sem `variantId`, a Shopify
        // não tem para onde buscar um preço "atual" do produto.
        priceSet: { shopMoney: { amount: item.unitPrice, currencyCode: input.currency } },
        requiresShipping: true,
      })),
      shippingAddress: {
        firstName: input.shippingAddress.firstName,
        address1: input.shippingAddress.address1,
        city: input.shippingAddress.city,
        province: input.shippingAddress.province,
        country: input.shippingAddress.country,
        phone: input.shippingAddress.phone,
      },
    },
  });

  const { order, userErrors } = data.orderCreate;
  if (userErrors.length > 0 || !order) {
    return { outcome: "userErrors", errors: userErrors.map((e) => e.message) };
  }

  return {
    outcome: "created",
    result: { shopifyOrderId: order.id, shopifyOrderName: order.name, shopifyCreatedAt: order.createdAt },
  };
}

// `first: 5` (e não 1) de propósito: precisamos conseguir DISTINGUIR
// "nenhum" de "exatamente um" de "mais de um". Com `first: 1` o caso de
// duplicata seria invisível e reconciliaríamos contra um pedido arbitrário.
const FIND_ORDERS_BY_SOURCE_IDENTIFIER_QUERY = /* GraphQL */ `
  query FindOrdersBySourceIdentifier($query: String!) {
    orders(first: 5, query: $query) {
      edges {
        node {
          id
          name
          createdAt
        }
      }
    }
  }
`;

interface FindOrdersResponse {
  orders: { edges: Array<{ node: { id: string; name: string; createdAt: string } }> };
}

/**
 * Reconciliação: procura pedidos já criados com o nosso
 * `sourceIdentifier`. Retorna a lista completa (até 5) para o caller
 * decidir — 0 libera retry, 1 reconcilia, >1 precisa de intervenção
 * manual (nunca criar mais um por cima de uma duplicata).
 *
 * Limitação conhecida: isto passa pelo índice de busca da Shopify, que não
 * garante contratualmente leitura-após-escrita imediata. Na prática a
 * consulta só acontece na tentativa seguinte (backoff ≥ 30s, ou 5 min no
 * caso de job órfão), bem longe da escrita.
 */
export async function findShopifyOrdersBySourceIdentifier(
  shopDomain: string,
  accessToken: string,
  sourceIdentifier: string
): Promise<ShopifyOrderRef[]> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken, {
    timeoutMs: ORDER_REQUEST_TIMEOUT_MS,
  });

  const data = await client.request<FindOrdersResponse>(FIND_ORDERS_BY_SOURCE_IDENTIFIER_QUERY, {
    query: `source_identifier:'${sourceIdentifier}'`,
  });

  return data.orders.edges.map((edge) => ({
    shopifyOrderId: edge.node.id,
    shopifyOrderName: edge.node.name,
    shopifyCreatedAt: edge.node.createdAt,
  }));
}
