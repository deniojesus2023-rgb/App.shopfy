import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logAudit } from "@/modules/audit/service";
import { isValidShopDomain } from "@/modules/shopify/domain";
import { exchangeCodeForAccessToken } from "@/modules/shopify/oauth/exchange";
import { consumeOAuthState } from "@/modules/shopify/oauth/state";
import { verifyOAuthCallbackHmac } from "@/modules/shopify/webhooks/verify";
import { fetchShopInfo } from "@/modules/shopify/client";
import { registerRequiredWebhooks } from "@/modules/shopify/webhooks/register";
import { connectStore } from "@/modules/shopify/stores/service";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Callback do OAuth Shopify. Sem sessão de app aqui — a única prova de
 * legitimidade é: (1) o `state` bate com uma linha não consumida e não
 * expirada no banco, criada por nós; (2) o HMAC da query string bate com o
 * segredo do nosso app. As duas checagens são independentes e ambas
 * obrigatórias.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  function fail(reason: string, workspaceSlug?: string) {
    const base = workspaceSlug
      ? `${env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/stores`
      : `${env.NEXT_PUBLIC_APP_URL}/workspaces`;
    return NextResponse.redirect(`${base}?error=${reason}`, { status: 303 });
  }

  if (!shop || !code || !state || !isValidShopDomain(shop)) {
    return fail("invalid_callback");
  }

  if (!verifyOAuthCallbackHmac(url.searchParams)) {
    return fail("invalid_hmac");
  }

  let consumed;
  try {
    consumed = await consumeOAuthState(state, shop);
  } catch {
    return fail("invalid_state");
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: consumed.workspaceId } });
  if (!workspace) {
    return fail("invalid_state");
  }

  try {
    const { access_token: accessToken, scope } = await exchangeCodeForAccessToken(shop, code);
    const shopInfo = await fetchShopInfo(shop, accessToken);

    const store = await connectStore({
      workspaceId: consumed.workspaceId,
      shopDomain: shop,
      accessToken,
      scope,
      displayName: shopInfo.name,
      currency: shopInfo.currencyCode,
    });

    await logAudit({
      workspaceId: consumed.workspaceId,
      userId: consumed.userId,
      action: "shopify.store_connected",
      entityType: "ShopifyStore",
      entityId: store.id,
      metadata: { shopDomain: shop, scope },
    });

    const registrations = await registerRequiredWebhooks(shop, accessToken);
    const failed = registrations.filter((r) => !r.ok);
    if (failed.length > 0) {
      await logAudit({
        workspaceId: consumed.workspaceId,
        userId: consumed.userId,
        action: "shopify.webhook_registration_failed",
        entityType: "ShopifyStore",
        entityId: store.id,
        metadata: { shopDomain: shop, failed: JSON.parse(JSON.stringify(failed)) },
      });
    }

    return NextResponse.redirect(
      `${env.NEXT_PUBLIC_APP_URL}/${workspace.slug}/stores?connected=1`,
      { status: 303 }
    );
  } catch (error) {
    console.error("[shopify-oauth-callback] unexpected error", error);
    return fail("connect_failed", workspace.slug);
  }
}
