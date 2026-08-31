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
  })
  .refine((v) => v.allowCod || v.allowOnlinePayment, {
    message: "Ao menos um método de pagamento deve estar habilitado.",
    path: ["allowCod"],
  });

export const paymentChoiceStepSchema = funnelStepBaseSchema.extend({
  type: z.literal("PAYMENT_CHOICE"),
  config: paymentChoiceStepConfigSchema,
});

export type PaymentChoiceStepConfig = z.infer<typeof paymentChoiceStepConfigSchema>;
export type PaymentChoiceStep = z.infer<typeof paymentChoiceStepSchema>;
