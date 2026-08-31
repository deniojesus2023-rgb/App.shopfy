import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rotas públicas: landing, auth do Clerk, webhook (que se autentica via
// HMAC do Svix, não via sessão) e a página de preview de convite (o
// convidado pode não estar logado ainda ao clicar no link).
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/invitations/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
