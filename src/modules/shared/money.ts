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

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

export const DEFAULT_CURRENCY = "COP";
