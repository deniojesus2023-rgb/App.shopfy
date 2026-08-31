import { after, NextResponse } from "next/server";

import { checkRateLimit } from "@/modules/shared/rate-limit";
import { findTopicByUrlSlug } from "@/modules/shopify/webhooks/topics";
import { verifyWebhookHmac } from "@/modules/shopify/webhooks/verify";
import { persistWebhookEvent, processWebhookEvent } from "@/modules/shopify/webhooks/service";

export const runtime = "nodejs";

/**
 * Endpoint único para todos os tópicos de webhook (`urlSlug` identifica
 * qual). Contrato: verificar HMAC sobre o corpo raw, persistir de forma
 * idempotente e responder rápido — o processamento de verdade acontece
 * depois, via `after()`, fora do caminho crítico da resposta ao Shopify
 * (que espera 2xx em poucos segundos ou reentrega o webhook).
 */
export async function POST(req: Request, { params }: { params: Promise<{ topic: string }> }) {
  const { topic: urlSlug } = await params;
  const topicDef = findTopicByUrlSlug(urlSlug);
  if (!topicDef) {
    return NextResponse.json({ error: "unknown topic" }, { status: 404 });
  }

  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const rateLimit = checkRateLimit(`shopify:webhook:${shopDomain ?? "unknown"}`, {
    limit: 300,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const webhookId = req.headers.get("x-shopify-webhook-id");
  const headerTopic = req.headers.get("x-shopify-topic");

  if (!shopDomain || !webhookId || headerTopic !== topicDef.header) {
    return NextResponse.json({ error: "missing or mismatched headers" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const result = await persistWebhookEvent({
    shopDomain,
    topic: topicDef.header,
    shopifyWebhookId: webhookId,
    payload,
  });

  if (result.outcome === "created") {
    after(() => processWebhookEvent(result.eventId));
  }

  // 200 sempre que a assinatura é válida — inclusive em duplicata — para a
  // Shopify parar de reentregar. Erros de processamento ficam registrados
  // no próprio evento (status FAILED), não na resposta HTTP.
  return NextResponse.json({ received: true });
}
