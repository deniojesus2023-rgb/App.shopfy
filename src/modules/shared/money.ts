/**
 * Estratégia única de dinheiro do projeto: nunca float solto em cálculo de
 * preço. Os campos no banco são `Decimal(12,2)` (mesmo padrão já usado em
 * `ProductVariant.price`/`FunnelProductSnapshot.unitPrice`); em memória,
 * todo valor passa por `roundMoney` (arredondamento em centavos) antes de
 * ser somado/gravado — nunca `a * b` puro sem passar por aqui.
 *
 * Moeda: a Shopify exige string decimal com 2 casas para todo `MoneyInput`,
 * mesmo em moedas "zero-decimal" como JPY — por isso o armazenamento em
 * Decimal(12,2) funciona igual para todas as moedas suportadas nesta fase
 * (COP incluso: ISO 4217 lista COP com 2 casas, ainda que o varejo local
 * normalmente não mostre centavos). Não implementamos regra de exibição
 * por moeda nesta fase — `formatMoney` sempre mostra 2 casas.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function multiplyMoney(value: number, factor: number): number {
  return roundMoney(value * factor);
}

export function compareMoney(a: number, b: number): -1 | 0 | 1 {
  const diff = roundMoney(a) - roundMoney(b);
  if (diff === 0) return 0;
  return diff > 0 ? 1 : -1;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export const DEFAULT_CURRENCY = "COP";

/**
 * Casas decimais usadas na EXIBIÇÃO por moeda (ISO 4217, minor unit) — só
 * para UI (Fase 4A). Nunca usado para o wire format da Shopify nem para o
 * storage em `Decimal(12,2)`, que continuam fixos em 2 casas por design
 * (ver comentário do módulo acima) — a Shopify exige string de 2 casas
 * mesmo em moeda "zero-decimal". Lista fechada e pequena de propósito:
 * cobre LATAM (nosso mercado atual) + as moedas zero-decimal mais comuns.
 * Uma moeda ausente aqui usa o fallback de 2 casas — nunca lança.
 */
const CURRENCY_DISPLAY_DECIMALS: Record<string, number> = {
  CLP: 0,
  JPY: 0,
  KRW: 0,
  COP: 2,
  BRL: 2,
  MXN: 2,
  PEN: 2,
  ARS: 2,
  USD: 2,
  EUR: 2,
};

/**
 * Formata para EXIBIÇÃO respeitando a moeda — não assume 2 casas
 * universalmente (spec Fase 4A item 5/23). Arredonda para a casa correta
 * antes de formatar (nunca trunca um COP em duas casas fingindo ser CLP).
 */
export function formatMoneyForDisplay(value: number, currency: string): string {
  const decimals = CURRENCY_DISPLAY_DECIMALS[currency.toUpperCase()] ?? 2;
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toFixed(decimals);
}
