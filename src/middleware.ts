import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Rotas públicas: landing, auth do Clerk, webhook (que se autentica via
// HMAC do Svix, não via sessão), a página de preview de convite (o
// convidado pode não estar logado ainda ao clicar no link) e o storefront
// público de funil (nunca exige sessão — resolvido por publicId/token, não
// por autenticação).
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/invitations/(.*)",
  "/f/(.*)",
]);

const isPublicFunnelRoute = createRouteMatcher(["/f/(.*)"]);

// CSP pragmática para a superfície pública não autenticada — ponto de
// partida, não blindagem completa (um CSP com nonce por request para o
// script de hydration do App Router é um projeto à parte). `style-src`
// precisa de 'unsafe-inline' por causa das CSS variables de tema aplicadas
// via `style={{...}}`; `script-src` fica restrito a 'self'.
const STOREFRONT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const response = NextResponse.next();
  if (isPublicFunnelRoute(req)) {
    response.headers.set("Content-Security-Policy", STOREFRONT_CSP);
    response.headers.set("X-Frame-Options", "DENY");
  }
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
