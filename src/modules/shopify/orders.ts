import "server-only";

import { createShopifyGraphqlClient } from "./client";

/**
 * ATENÇÃO — mutação não reconferida contra a documentação ao vivo desta
 * fase: o sandbox onde isto foi escrito bloqueia egress para shopify.dev,
 * então o shape abaixo é a melhor reconstrução por conhecimento treinado
 * do Admin GraphQL API (`orderCreate`, versão pinned em `client.ts`), não
 * uma cópia verificada da doc. Antes de setar `SHOPIFY_ORDER_SYNC_ENABLED
 * =true` em produção: validar este mutation shape contra
 * https://shopify.dev/docs/api/admin-graphql/<versão>/mutations/orderCreate
 * num dev store real. Decisões deliberadas para reduzir risco enquanto
 * isso não acontece:
 *   - `lineItems` são "custom line items" (sem `variantId`) — o preço vem
 *     sempre do nosso `calculateOrderQuote()`, nunca do Product ao vivo
 *     sincronizado na Shopify (spec item 19).
 *   - `financialStatus: PENDING` sempre — nunca simulamos pagamento (COD).
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
  lineItems: Array<{ title: string; quantity: number; unitPrice: string }>;
  /** Sem colon — a sintaxe de busca da Shopify (`tag:'...'`) trata `:` como delimitador. */
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

export interface CreateShopifyOrderResult {
  shopifyOrderId: string;
  shopifyOrderName: string;
  shopifyCreatedAt: string;
}

export type CreateShopifyOrderOutcome =
  | { outcome: "created"; result: CreateShopifyOrderResult }
  | { outcome: "userErrors"; errors: string[] };

export async function createShopifyOrder(
  shopDomain: string,
  accessToken: string,
  input: CreateShopifyOrderInput
): Promise<CreateShopifyOrderOutcome> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);

  const data = await client.request<OrderCreateResponse>(ORDER_CREATE_MUTATION, {
    order: {
      currency: input.currency,
      financialStatus: "PENDING",
      tags: ["cod", input.internalOrderTag],
      note: input.note,
      phone: input.phone,
      lineItems: input.lineItems.map((item) => ({
        title: item.title,
        quantity: item.quantity,
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

const FIND_ORDER_BY_TAG_QUERY = /* GraphQL */ `
  query FindOrderByTag($query: String!) {
    orders(first: 1, query: $query) {
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

interface FindOrderByTagResponse {
  orders: { edges: Array<{ node: { id: string; name: string; createdAt: string } }> };
}

/**
 * Reconciliação (spec item 21/6): antes de criar, procura por um pedido já
 * criado com a mesma tag `internal_order_<id>` — cobre o caso "Shopify
 * criou, nossa resposta caiu antes de salvar localmente, worker retentou".
 * Não é uma garantia formal de idempotência (a Shopify não documenta uma
 * para `orderCreate` até onde pude confirmar) — é mitigação best-effort.
 */
export async function findShopifyOrderByInternalTag(
  shopDomain: string,
  accessToken: string,
  internalOrderTag: string
): Promise<CreateShopifyOrderResult | null> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);
  const data = await client.request<FindOrderByTagResponse>(FIND_ORDER_BY_TAG_QUERY, {
    query: `tag:'${internalOrderTag}'`,
  });

  const node = data.orders.edges[0]?.node;
  if (!node) return null;
  return { shopifyOrderId: node.id, shopifyOrderName: node.name, shopifyCreatedAt: node.createdAt };
}
