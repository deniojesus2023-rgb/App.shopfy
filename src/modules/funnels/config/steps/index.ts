import { z } from "zod";

import { codFormStepSchema } from "./cod-form";
import { offerStepSchema } from "./offer";
import { paymentChoiceStepSchema } from "./payment-choice";
import { productStepSchema } from "./product";
import { rewardStepSchema } from "./reward";
import { successStepSchema } from "./success";
import { upsellStepSchema } from "./upsell";

export const funnelStepSchema = z.discriminatedUnion("type", [
  productStepSchema,
  rewardStepSchema,
  offerStepSchema,
  paymentChoiceStepSchema,
  codFormStepSchema,
  successStepSchema,
  upsellStepSchema,
]);

export type FunnelStep = z.infer<typeof funnelStepSchema>;
export type FunnelStepType = FunnelStep["type"];

export * from "./cod-form";
export * from "./offer";
export * from "./payment-choice";
export * from "./product";
export * from "./reward";
export * from "./success";
export * from "./upsell";
