import { z } from "zod";

import { safeText } from "./text";

/**
 * Regras de progresso do MVP (Fase 4B). Deliberadamente NÃO é uma DSL
 * genérica — só os 3 tipos concretos abaixo. `ORDER_CONFIRMED` não existe
 * aqui como um 4º tipo selecionável: é um override incondicional aplicado
 * por `evaluateGamification` sempre que `context.orderConfirmed === true`,
 * independente da regra configurada (ver modules/funnels/gamification/evaluate.ts)
 * — assim a "recompensa liberada" nunca depende de o lojista lembrar de
 * escolher a regra certa.
 */
export const gamificationProgressRuleSchema = z.discriminatedUnion("type", [
  // Marco fixo e verdadeiro do FLUXO (ex.: "ao chegar em REWARD, 85%") —
  // nunca representa dinheiro ganho/economizado.
  z.object({
    type: z.literal("STATIC_PROGRESS"),
    baseProgress: z.number().min(0).max(100),
  }),
  // Progresso muda conforme a oferta selecionada. `baseProgress` vale
  // enquanto nenhuma oferta foi escolhida; depois, `offerProgress[offerId]`.
  z.object({
    type: z.literal("OFFER_SELECTION_PROGRESS"),
    baseProgress: z.number().min(0).max(100),
    offerProgress: z.record(z.string().min(1).max(64), z.number().min(0).max(100)),
  }),
  // Regra monetária real: progresso deriva da ECONOMIA (nunca crédito ou
  // saldo) da oferta selecionada, calculada pelo Pricing Engine (Fase 4A) —
  // nunca um número digitado pelo lojista.
  z.object({
    type: z.literal("VALUE_THRESHOLD"),
    source: z.literal("SELECTED_OFFER_SAVINGS"),
    targetValue: z.number().positive().max(100_000_000),
    benefitType: z.literal("SAVINGS"),
  }),
]);

export type GamificationProgressRule = z.infer<typeof gamificationProgressRuleSchema>;

/**
 * `DISPLAY_REWARD` (MESSAGE_ONLY, FREE_SHIPPING_DISPLAY) é só informação —
 * nunca altera o que é cobrado. `FIXED_DISCOUNT`/`PERCENT_DISCOUNT`
 * (`PRICING_REWARD`) existem no schema só para o formato ficar preparado —
 * a validação semântica (semantic-validation.ts) REJEITA publicar qualquer
 * um dos dois nesta fase: não há integração com `calculateOrderQuote()`
 * ainda, e uma recompensa "econômica" que não muda `Order.total` de
 * verdade seria exatamente o tipo de promessa falsa que este motor existe
 * para eliminar (spec Fase 4B item 15 — fail closed, nunca fail silencioso).
 */
export const gamificationRewardSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MESSAGE_ONLY"), message: safeText(200) }),
  // Só é honesto porque `OrderQuote.shippingTotal` é sempre 0 nesta fase
  // (nenhum motor de frete existe ainda — modules/orders/pricing.ts). Se um
  // dia houver frete pago, este tipo precisa ser revisto antes de continuar
  // anunciando "envio grátis".
  z.object({ type: z.literal("FREE_SHIPPING_DISPLAY"), message: safeText(200) }),
  z.object({ type: z.literal("FIXED_DISCOUNT"), amount: z.number().positive() }),
  z.object({ type: z.literal("PERCENT_DISCOUNT"), percent: z.number().positive().max(100) }),
]);

export type GamificationReward = z.infer<typeof gamificationRewardSchema>;

/** Tipos cuja aplicação real de preço ainda não existe — publish é bloqueado quando usados (ver semantic-validation.ts). */
export const UNSUPPORTED_PRICING_REWARD_TYPES = ["FIXED_DISCOUNT", "PERCENT_DISCOUNT"] as const;

export const gamificationMilestoneSchema = z.object({
  progress: z.number().min(0).max(100),
  label: safeText(80),
});

export type GamificationMilestone = z.infer<typeof gamificationMilestoneSchema>;

export const MAX_GAMIFICATION_MILESTONES = 5;
