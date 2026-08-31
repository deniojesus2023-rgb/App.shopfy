/**
 * Mecanismo explícito de preço por quantidade — deliberadamente simples
 * (unitPrice × quantity), sem curva de desconto. Uma engine de pricing
 * rules de verdade é trabalho de fase futura; até lá, nenhum preço é
 * inventado no frontend — tudo é calculado aqui, a partir do
 * FunnelProductSnapshot tirado no momento da publicação.
 */
export function computeOfferPrice(unitPrice: number, quantity: number): number {
  // Arredonda em centavos para nunca vazar erro de ponto flutuante (ex.:
  // 0.1 + 0.2) num preço exibido ao cliente final.
  return Math.round(unitPrice * quantity * 100) / 100;
}

export function formatPrice(value: number): string {
  // Sem símbolo de moeda: o catálogo (ProductVariant.price) não modela
  // moeda por loja ainda — inventar "$" seria dado incorreto para lojas em
  // moedas diferentes. Revisar quando a Fase de pagamentos definir moeda.
  return value.toFixed(2);
}
