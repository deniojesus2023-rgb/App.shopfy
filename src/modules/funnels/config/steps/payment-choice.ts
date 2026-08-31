import { z } from "zod";

import { safeText } from "../text";
import { funnelStepBaseSchema } from "./base";

export const paymentChoiceStepConfigSchema = z
  .object({
    allowCod: z.boolean(),
    allowOnlinePayment: z.boolean(),
    codLabel: safeText(80),
    onlinePaymentLabel: safeText(80),
    codDescription: safeText(300, { optional: true }),
    onlinePaymentDescription: safeText(300, { optional: true }),
    onlinePaymentDiscountDisplay: safeText(80, { optional: true }),
    // Qual método aparece marcado como recomendado no storefront — decisão
    // do lojista via config, o runtime nunca decide isso sozinho.
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

export const paymentChoiceStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("PAYMENT_CHOICE"),
  config: paymentChoiceStepConfigSchema,
});

export type PaymentChoiceStepConfig = z.infer<typeof paymentChoiceStepConfigSchema>;
export type PaymentChoiceStep = z.infer<typeof paymentChoiceStepSchema>;
