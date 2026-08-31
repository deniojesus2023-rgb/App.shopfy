import "server-only";

// Versão da Admin API. Fixa e revisada manualmente — nunca "latest", para
// não sofrer mudança de contrato sem aviso em produção. Revisar a cada
// poucos trimestres conforme o calendário de deprecação da Shopify.
export const SHOPIFY_API_VERSION = "2025-01";

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Cliente único para a Shopify Admin GraphQL API. Nenhum outro módulo deve
 * montar uma request para `*.myshopify.com` diretamente — centralizar aqui
 * é o que permite auditar "todo lugar que usa o token" em um arquivo só.
 */
export function createShopifyGraphqlClient(shopDomain: string, accessToken: string) {
  const endpoint = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new ShopifyApiError(`Shopify GraphQL respondeu ${response.status}`, {
        status: response.status,
      });
    }

    const json = (await response.json()) as GraphqlResponse<T>;
    if (json.errors?.length) {
      throw new ShopifyApiError(
        `Shopify GraphQL retornou erro: ${json.errors.map((e) => e.message).join("; ")}`
      );
    }
    if (!json.data) {
      throw new ShopifyApiError("Shopify GraphQL não retornou `data`.");
    }

    return json.data;
  }

  return { request };
}

const SHOP_INFO_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      email
      plan {
        displayName
      }
    }
  }
`;

interface ShopInfoResponse {
  shop: {
    name: string;
    myshopifyDomain: string;
    email: string;
    plan: { displayName: string } | null;
  };
}

export async function fetchShopInfo(shopDomain: string, accessToken: string) {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);
  const data = await client.request<ShopInfoResponse>(SHOP_INFO_QUERY);
  return data.shop;
}
