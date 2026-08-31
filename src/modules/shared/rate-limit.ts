import "server-only";

// Rate limiter de janela fixa, em memória. Suficiente para uma instância
// (ou para "amortecer" abuso enquanto uma instância serverless está quente),
// mas NÃO é garantia forte em produção multi-instância — cada função
// serverless da Vercel tem sua própria memória. Quando o tráfego justificar,
// trocar por um store compartilhado (Upstash Redis) atrás desta mesma
// assinatura, sem tocar nos call sites.
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}
