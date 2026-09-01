import { NextResponse } from "next/server";

import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { startOnlineCheckout } from "@/modules/orders/online-checkout-service";
import { startOnlineCheckoutSchema } from "@/modules/orders/schemas";

export const runtime = "nodejs";

// Corpo esperado é minúsculo (só identidades) — bem menor que o do
// checkout COD, que ainda carrega o formulário do cliente.
const MAX_BODY_BYTES = 4 * 1024;

const GENERIC_ERROR = "No pudimos preparar el pago en línea. Inténtalo nuevamente.";

/**
 * POST /api/storefront/online-checkout — prepara um checkout ONLINE via
 * Draft Order da Shopify e devolve APENAS a `checkoutUrl`.
 *
 * Nunca cria Order local: nenhum pedido existe antes do pagamento (Fase
 * 4D). Autoridade de preço/tenant/elegibilidade/readiness é 100% do
 * servidor (modules/orders/online-checkout-service.ts); este handler só
 * cuida de transporte, rate limit e mapear erro de domínio -> resposta
 * pública segura.
 */
export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Corpo da requisição muito grande." }, { status: 413 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : "unknown";

  // Cada tentativa aqui vira uma ESCRITA na Shopify (draft order), então o
  // teto por IP é mais apertado que o do checkout COD.
  const globalLimit = checkRateLimit(`storefront:online-checkout:ip:${ip}`, {
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!globalLimit.allowed) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Revisa los datos ingresados." }, { status: 400 });
  }

  const parsed = startOnlineCheckoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Revisa los datos ingresados." }, { status: 400 });
  }

  const perFunnelLimit = checkRateLimit(
    `storefront:online-checkout:funnel:${parsed.data.funnelPublicId}:ip:${ip}`,
    { limit: 6, windowMs: 5 * 60 * 1000 }
  );
  if (!perFunnelLimit.allowed) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 429 });
  }

  try {
    const result = await startOnlineCheckout(parsed.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    console.error("[storefront/online-checkout] unexpected error", error);
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
