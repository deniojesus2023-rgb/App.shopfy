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

  /** Status HTTP quando a falha veio de uma resposta (não de transporte). */
  get httpStatus(): number | null {
    const status = (this.details as { status?: unknown } | undefined)?.status;
    return typeof status === "number" ? status : null;
  }
}

/** Token inválido/revogado (HTTP 401). Não adianta retentar com o mesmo token. */
export class ShopifyAuthError extends ShopifyApiError {
  constructor(message = "Access token da Shopify inválido ou revogado.") {
    super(message);
    this.name = "ShopifyAuthError";
  }
}

/** Cost-based throttling da GraphQL API. Retentável com backoff. */
export class ShopifyThrottledError extends ShopifyApiError {
  constructor(message = "Requisição throttled pela Shopify (limite de custo da API).") {
    super(message);
    this.name = "ShopifyThrottledError";
  }
}

/**
 * Estourou o tempo limite do cliente esperando resposta. Diferente de
 * throttle: aqui a request PODE ter sido processada pela Shopify — quem
 * chama precisa tratar como resultado ambíguo (ver
 * modules/orders/handlers/shopify-order-create.ts) e nunca simplesmente
 * repetir uma mutação de escrita.
 */
export class ShopifyTimeoutError extends ShopifyApiError {
  constructor(message = "Tempo limite excedido esperando a Shopify responder.") {
    super(message);
    this.name = "ShopifyTimeoutError";
  }
}

interface GraphqlError {
  message: string;
  extensions?: { code?: string };
}

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
  extensions?: { cost?: { throttleStatus?: ThrottleStatus } };
}

export interface ShopifyGraphqlResult<T> {
  data: T;
  throttleStatus: ThrottleStatus | null;
}

/**
 * Cliente único para a Shopify Admin GraphQL API. Nenhum outro módulo deve
 * montar uma request para `*.myshopify.com` diretamente — centralizar aqui
 * é o que permite auditar "todo lugar que usa o token" em um arquivo só, e
 * tratar de forma uniforme autenticação inválida e throttling.
 */
export interface ShopifyClientOptions {
  /**
   * Tempo limite por request. Opcional e sem default de propósito: os
   * callers de catálogo (Fase 1B) seguem com o comportamento anterior
   * (sem AbortSignal). O módulo de pedidos passa um valor explícito
   * porque, numa mutação de escrita, uma conexão pendurada precisa virar
   * um erro classificável (`ShopifyTimeoutError` = ambíguo) em vez de
   * bloquear o worker até a plataforma matar a função.
   */
  timeoutMs?: number;
}

export function createShopifyGraphqlClient(
  shopDomain: string,
  accessToken: string,
  options: ShopifyClientOptions = {}
) {
  const endpoint = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  async function requestWithMeta<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<ShopifyGraphqlResult<T>> {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ShopifyTimeoutError();
      }
      throw error;
    }

    if (response.status === 401) {
      throw new ShopifyAuthError();
    }
    if (!response.ok) {
      throw new ShopifyApiError(`Shopify GraphQL respondeu ${response.status}`, {
        status: response.status,
      });
    }

    const json = (await response.json()) as GraphqlResponse<T>;

    if (json.errors?.length) {
      const isThrottled = json.errors.some((e) => e.extensions?.code === "THROTTLED");
      if (isThrottled) {
        throw new ShopifyThrottledError();
      }
      throw new ShopifyApiError(
        `Shopify GraphQL retornou erro: ${json.errors.map((e) => e.message).join("; ")}`
      );
    }
    if (!json.data) {
      throw new ShopifyApiError("Shopify GraphQL não retornou `data`.");
    }

    return { data: json.data, throttleStatus: json.extensions?.cost?.throttleStatus ?? null };
  }

  async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const result = await requestWithMeta<T>(query, variables);
    return result.data;
  }

  return { request, requestWithMeta };
}

const SHOP_INFO_QUERY = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      email
      currencyCode
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
    currencyCode: string;
    plan: { displayName: string } | null;
  };
}

export async function fetchShopInfo(shopDomain: string, accessToken: string) {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);
  const data = await client.request<ShopInfoResponse>(SHOP_INFO_QUERY);
  return data.shop;
}
