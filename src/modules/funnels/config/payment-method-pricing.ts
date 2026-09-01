import { z } from "zod";

// Teto arbitrário mas generoso — mesmo raciocínio de pricing-rule.ts: só
// existe para rejeitar overflow/erro de digitação grosseiro.
const MAX_DISCOUNT_AMOUNT = 100_000_000;

// Diferente de `moneyAmountSchema` (pricing-rule.ts), aqui ZERO é permitido
// de propósito (spec Fase 4C item 8: "0 <= discount <= offerTotal") — um
// FIXED_DISCOUNT de 0 é redundante com NONE, mas não é um bug de config,
// é só um caso degenerado que o lojista pode ter deixado assim.
const discountAmountSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_DISCOUNT_AMOUNT)
  .refine((v) => Math.round(v * 100) / 100 === v, "Valor monetário deve ter no máximo 2 casas decimais.");

// `0 < percent <= 100` (spec item 8): zero não é permitido aqui porque
// "sem desconto" já tem representação própria (NONE) — um PERCENT_DISCOUNT
// de 0% seria um estado ambíguo (por que não usar NONE?), nunca um valor
// legítimo de configuração.
const percentSchema = z.number().finite().positive().max(100);

/**
 * Regra de preço de um MÉTODO DE PAGAMENTO (Fase 4C) — aplicada DEPOIS do
 * preço da oferta (Fase 4A), nunca sobre `referenceSubtotal`. Extensível de
 * propósito (união discriminada), só 3 tipos nesta fase.
 *
 * IMPORTANTE: "desconto não pode superar o total" (spec item 8) NÃO é
 * validável aqui — o total contra o qual o desconto incide depende da
 * OFERTA escolhida em runtime (FIXED_TOTAL vs UNIT_MULTIPLIER variam por
 * quantidade), que esta etapa de config não conhece. Essa checagem é
 * feita em runtime por `calculateOrderQuote` (fail closed — nunca clamp
 * silencioso, ver modules/orders/pricing.ts).
 */
export const paymentMethodPricingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({ type: z.literal("FIXED_DISCOUNT"), amount: discountAmountSchema }),
  z.object({ type: z.literal("PERCENT_DISCOUNT"), percent: percentSchema }),
]);

export type PaymentMethodPricing = z.infer<typeof paymentMethodPricingSchema>;
