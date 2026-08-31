import "server-only";

import { env } from "@/lib/env";
import { ShopifyApiError } from "../client";

interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

/**
 * Troca o `code` de autorização por um access token. Chamado uma única vez
 * por conexão — a Shopify invalida o `code` no primeiro uso, então mesmo
 * sem o nosso controle de state isso já não seria replayable; o state
 * (oauth/state.ts) nos protege da etapa anterior (CSRF no redirect).
 */
export async function exchangeCodeForAccessToken(
  shopDomain: string,
  code: string
): Promise<AccessTokenResponse> {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    throw new ShopifyApiError(`Falha ao trocar code por token (${response.status}).`);
  }

  const data = (await response.json()) as Partial<AccessTokenResponse>;
  if (!data.access_token || !data.scope) {
    throw new ShopifyApiError("Resposta de token da Shopify incompleta.");
  }

  return { access_token: data.access_token, scope: data.scope };
}
