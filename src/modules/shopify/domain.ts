const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Normaliza entradas comuns do usuário para o formato canônico
 * `<handle>.myshopify.com`: aceita apenas o handle ("minha-loja"), a URL
 * completa ("https://minha-loja.myshopify.com/admin") ou já o domínio.
 * Retorna `null` se não for possível chegar em um domínio Shopify válido —
 * o caller decide o que fazer (nunca lança, entrada de usuário é esperada
 * ser inválida às vezes).
 */
export function normalizeShopDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0];
  if (!host) return null;

  const candidate = host.includes(".") ? host : `${host}.myshopify.com`;

  return SHOP_DOMAIN_REGEX.test(candidate) ? candidate : null;
}

export function isValidShopDomain(value: string): boolean {
  return SHOP_DOMAIN_REGEX.test(value);
}
