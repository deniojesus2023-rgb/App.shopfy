import { z } from "zod";

// Teto arbitrário mas generoso — só existe para rejeitar overflow/erro de
// digitação grosseiro (ex.: um zero a mais), nunca para limitar um preço
// legítimo de LATAM em moeda local.
const MAX_AMOUNT = 100_000_000;

// `amount` precisa ser representável em centavos sem perda — barra o tipo
// de float impreciso que `0.1 + 0.2` produziria se alguém computasse isso
// em vez de digitar um valor direto. Nunca negativo, nunca zero (uma
// oferta de preço zero não é uma oferta, é um bug de config).
const moneyAmountSchema = z
  .number()
  .finite()
  .positive()
  .max(MAX_AMOUNT)
  .refine((v) => Math.round(v * 100) / 100 === v, "Valor monetário deve ter no máximo 2 casas decimais.");

/**
 * Regra comercial de uma oferta (Fase 4A). Extensível de propósito — a
 * união discriminada é o ponto de entrada para tipos futuros (tier
 * pricing, cupons, etc.), mas SÓ dois existem nesta fase:
 *
 * - UNIT_MULTIPLIER: total = productSnapshot.unitPrice × quantity. É o
 *   comportamento histórico (Fase 2B/3), sempre determinístico a partir do
 *   snapshot — nunca precisa de um valor próprio no config.
 * - FIXED_TOTAL: o lojista define o total do pacote diretamente. Pode ser
 *   maior OU menor que unitPrice × quantity (ver resolve-offer-price.ts —
 *   "desconto" negativo = sobretaxa é permitido, só avisado no Builder).
 */
export const pricingRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("UNIT_MULTIPLIER") }),
  z.object({ type: z.literal("FIXED_TOTAL"), amount: moneyAmountSchema }),
]);

export type PricingRule = z.infer<typeof pricingRuleSchema>;
