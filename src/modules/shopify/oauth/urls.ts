import { env } from "@/lib/env";
import { SHOPIFY_SCOPES_STRING } from "../scopes";

export function buildAuthorizeUrl(shopDomain: string, state: string): string {
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/shopify/oauth/callback`;

  const params = new URLSearchParams({
    client_id: env.SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES_STRING,
    redirect_uri: callbackUrl,
    state,
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}
