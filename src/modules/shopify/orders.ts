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
 *   - `lineItems` levam `variantId` real quando a versão publicada congelou
 *     a identidade da variante, e `priceSet` SEMPRE — o preço vem do nosso
 *     `calculateOrderQuote()`, nunca do Product ao vivo. Sem variante
 *     congelada (snapshots antigos), cai em custom line item.
 *     A VERIFICAR no dev store antes de ligar o sync: que `priceSet` tem
 *     precedência sobre o preço do catálogo quando `variantId` é enviado.
 *     Se não tiver, a saída é voltar a omitir `variantId` — nunca aceitar
 *     cobrar um valor diferente do que o cliente aceitou.
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
   *
   * `quantity` é sempre a quantidade FÍSICA real de unidades. Um pacote
   * cujo total não divide exato em centavos vira mais de um line item da
   * mesma variante, nunca uma linha de quantidade 1 mentindo sobre o que
   * foi vendido (ver modules/orders/shopify-line-items.ts).
   *
   * `variantId` é o GID da variante real quando a versão publicada
   * congelou essa identidade; `null` cai em custom line item.
   */
  lineItems: Array<{ variantId: string | null; title: string; quantity: number; unitPrice: string }>;
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
        // Só entra quando a identidade da variante foi congelada. Com
        // `variantId`, o pedido na Shopify passa a ser um pedido de produto
        // real — inventory, fulfillment e relatórios enxergam a variante e a
        // quantidade certas, em vez de um item avulso.
        ...(item.variantId ? { variantId: item.variantId } : {}),
        // Apresentação apenas — nenhum consumidor downstream lê quantidade
        // ou identidade daqui.
        title: item.title,
        quantity: item.quantity,
        // priceSet = preço unitário no dinheiro da loja, sempre o do NOSSO
        // `calculateOrderQuote()`. É o que impede a Shopify de recalcular o
        // preço a partir do catálogo ao vivo quando mandamos `variantId`.
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
