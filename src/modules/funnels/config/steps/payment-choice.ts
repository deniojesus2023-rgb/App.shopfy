import { z } from "zod";

import { checkoutProviderSchema } from "../checkout-provider";
import { paymentMethodPricingSchema } from "../payment-method-pricing";
import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

// ---------------------------------------------------------------------------
// V3 (legado) — dois booleans + labels soltos, sem provider nem regra de
// preço por método. Existe só para validar/ler config publicado antes da
// Fase 4C; `parseFunnelConfig` migra para V4 em memória. Nenhum código novo
// deve importar isto fora de config/parse.ts e config/migrate.ts.
// ---------------------------------------------------------------------------
export const paymentChoiceStepConfigSchemaV3 = z
  .object({
    allowCod: z.boolean(),
    allowOnlinePayment: z.boolean(),
    codLabel: safeText(80),
    onlinePaymentLabel: safeText(80),
    codDescription: safeText(300, { optional: true }),
    onlinePaymentDescription: safeText(300, { optional: true }),
    onlinePaymentDiscountDisplay: safeText(80, { optional: true }),
    recommendedMethod: z.enum(["COD", "ONLINE"]).optional(),
  })
  .refine((v) => v.allowCod || v.allowOnlinePayment, {
    message: "Ao menos um método de pagamento deve estar habilitado.",
    path: ["allowCod"],
  })
  .refine(
    (v) =>
      !v.recommendedMethod ||
      (v.recommendedMethod === "COD" && v.allowCod) ||
      (v.recommendedMethod === "ONLINE" && v.allowOnlinePayment),
    { message: "recommendedMethod precisa ser um método habilitado.", path: ["recommendedMethod"] }
  );

export const paymentChoiceStepSchemaV3 = funnelStepBaseSchema.extend({
  type: z.literal("PAYMENT_CHOICE"),
  config: paymentChoiceStepConfigSchemaV3,
});

export type PaymentChoiceStepConfigV3 = z.infer<typeof paymentChoiceStepConfigSchemaV3>;

// ---------------------------------------------------------------------------
// V4 (atual, Fase 4C) — cada método de pagamento é uma entrada própria,
// com identidade (`id`), provider e regra de preço. `method`/`provider`/
// `pricing` são três conceitos deliberadamente separados (spec item 2):
// COMO o cliente paga, QUEM executa o checkout, e o EFEITO comercial.
// ---------------------------------------------------------------------------
const paymentMethodConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    method: z.enum(["COD", "ONLINE"]),
    provider: checkoutProviderSchema,
    enabled: z.boolean(),
    label: safeText(80),
    description: safeText(300, { optional: true }),
    pricing: paymentMethodPricingSchema,
  })
  // Regra estrutural (spec item 4): COD só pode rodar no provider interno;
  // ONLINE só pode apontar para um dos providers externos. Nunca os dois
  // combinados — evita, por exemplo, um COD "processado pela Yampi" que
  // não faz sentido nenhum neste produto.
  .refine((v) => (v.method === "COD" ? v.provider === "INTERNAL_COD" : v.provider !== "INTERNAL_COD"), {
    message: "COD exige provider INTERNAL_COD; ONLINE exige SHOPIFY_CHECKOUT ou YAMPI.",
    path: ["provider"],
  });

export const paymentChoiceStepConfigSchema = z
  .object({
    paymentMethods: z.array(paymentMethodConfigSchema).min(1).max(6),
    // Qual método aparece marcado como recomendado — decisão do lojista,
    // nunca escolhida automaticamente pelo runtime.
    recommendedMethodId: z.string().max(64).optional(),
  })
  .refine((v) => new Set(v.paymentMethods.map((m) => m.id)).size === v.paymentMethods.length, {
    message: "IDs de método de pagamento duplicados.",
    path: ["paymentMethods"],
  })
  .refine((v) => v.paymentMethods.some((m) => m.enabled), {
    message: "Ao menos um método de pagamento deve estar habilitado.",
    path: ["paymentMethods"],
  })
  .refine((v) => !v.recommendedMethodId || v.paymentMethods.some((m) => m.id === v.recommendedMethodId), {
    message: "recommendedMethodId precisa referenciar um método existente.",
    path: ["recommendedMethodId"],
  });

export const paymentChoiceStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("PAYMENT_CHOICE"),
  config: paymentChoiceStepConfigSchema,
});

export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;
export type PaymentChoiceStepConfig = z.infer<typeof paymentChoiceStepConfigSchema>;
export type PaymentChoiceStep = z.infer<typeof paymentChoiceStepSchema>;
