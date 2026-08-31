import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { requireUser } from "@/modules/identity/service";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/modules/shared/errors";
import { normalizeShopDomain } from "@/modules/shopify/domain";
import { createOAuthState } from "@/modules/shopify/oauth/state";
import { buildAuthorizeUrl } from "@/modules/shopify/oauth/urls";
import { connectStoreSchema } from "@/modules/shopify/stores/schemas";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";

export const runtime = "nodejs";

/**
 * Início do fluxo OAuth. É um POST de formulário HTML normal (não uma
 * Server Action) porque o passo seguinte é um redirect 302 para fora da
 * aplicação — Server Actions não são o mecanismo certo para isso.
 *
 * workspaceSlug vem do form, mas nunca é confiado por si só: toda a
 * checagem de membership + permissão é refeita aqui no servidor via
 * `requireWorkspacePermission`.
 */
export async function POST(req: Request) {
  const formData = await req.formData();
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");

  if (!workspaceSlug) {
    return NextResponse.json({ error: "workspaceSlug ausente" }, { status: 400 });
  }

  const redirectBase = `${env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/stores`;

  try {
    const user = await requireUser();

    const rateLimit = checkRateLimit(`shopify:install:${user.id}`, {
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.redirect(`${redirectBase}?error=rate_limited`, { status: 303 });
    }

    const ctx = await requireWorkspacePermission(workspaceSlug, "shopify:manage_stores");

    const parsed = connectStoreSchema.safeParse({
      shopDomainInput: formData.get("shopDomainInput"),
    });
    if (!parsed.success) {
      return NextResponse.redirect(`${redirectBase}?error=invalid_domain`, { status: 303 });
    }

    const shopDomain = normalizeShopDomain(parsed.data.shopDomainInput);
    if (!shopDomain) {
      return NextResponse.redirect(`${redirectBase}?error=invalid_domain`, { status: 303 });
    }

    const state = await createOAuthState({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      shopDomain,
    });

    return NextResponse.redirect(buildAuthorizeUrl(shopDomain, state), { status: 303 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/sign-in`, { status: 303 });
    }
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return NextResponse.redirect(`${redirectBase}?error=forbidden`, { status: 303 });
    }
    console.error("[shopify-oauth-install] unexpected error", error);
    return NextResponse.redirect(`${redirectBase}?error=unexpected`, { status: 303 });
  }
}
