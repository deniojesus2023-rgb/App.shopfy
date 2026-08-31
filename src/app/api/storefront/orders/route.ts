import { NextResponse } from "next/server";

import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { checkRateLimit } from "@/modules/shared/rate-limit";
import { submitCheckout } from "@/modules/orders/service";
import { submitCheckoutSchema } from "@/modules/orders/schemas";

export const runtime = "nodejs";

// 8KB é folgado para o corpo esperado (nomes/endereço curtos, nenhum
// upload) — um corpo maior que isso já é sinal de abuso, rejeita cedo sem
// nem tentar fazer JSON.parse.
const MAX_BODY_BYTES = 8 * 1024;

// Resposta genérica para qualquer erro que não seja um dos nossos erros de
// domínio conhecidos — nunca vaza stack trace/mensagem interna a um
// endpoint público anônimo.
const GENERIC_ERROR = "No pudimos confirmar tu pedido. Inténtalo nuevamente.";

/**
 * POST /api/storefront/orders — o único caminho para criar um Order COD.
 * Autoridade de preço/tenant/elegibilidade de versão é 100% do servidor
 * (ver modules/orders/service.ts); este handler só cuida de transporte,
 * rate limit e mapear erro de domínio -> resposta pública segura.
 */
export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Corpo da requisição muito grande." }, { status: 413 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : "unknown";

  // Duas janelas: um teto solto por IP (blunt contra scraping/DoS de baixo
  // esforço) e um teto apertado por IP+funil (um visitante legítimo nunca
  // precisa de mais que uns poucos submits do mesmo funil em 5 minutos —
  // idempotência já cobre o "cliquei duas vezes").
  const globalLimit = checkRateLimit(`storefront:orders:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!globalLimit.allowed) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Revisa los datos ingresados." }, { status: 400 });
  }

  const parsed = submitCheckoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Revisa los datos ingresados." }, { status: 400 });
  }

  const perFunnelLimit = checkRateLimit(`storefront:orders:funnel:${parsed.data.funnelPublicId}:ip:${ip}`, {
    limit: 8,
    windowMs: 5 * 60 * 1000,
  });
  if (!perFunnelLimit.allowed) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 429 });
  }

  try {
    const result = await submitCheckout(parsed.data);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    console.error("[storefront/orders] unexpected error", error);
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
}
