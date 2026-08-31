import type { FunnelConfigV1 } from "./schema";
import type { FunnelStep } from "./steps";

export interface SemanticValidationError {
  path: string;
  message: string;
}

export interface FunnelProductRef {
  productId: string;
  role: "PRIMARY" | "UPSELL" | "DOWNSELL";
  product: { workspaceId: string; shopifyStoreId: string };
}

export interface SemanticValidationContext {
  workspaceId: string;
  shopifyStoreId: string;
  funnelProducts: FunnelProductRef[];
}

function enabledStepsOfType<T extends FunnelStep["type"]>(steps: FunnelStep[], type: T) {
  return steps.filter((s): s is Extract<FunnelStep, { type: T }> => s.type === type && s.enabled);
}

/**
 * Validação semântica: regras que cruzam múltiplas etapas, ou que
 * dependem de dados fora do config (produtos do funil). O Zod estrutural
 * (config/schema.ts) já garante que cada etapa, isolada, é bem formada —
 * isto aqui garante que o CONJUNTO de etapas faz sentido como funil.
 * Nunca lança: retorna a lista de erros (vazia = válido) para o caller
 * decidir o que fazer (bloquear publicação, mostrar na UI, etc).
 */
export function validateFunnelSemantics(
  config: FunnelConfigV1,
  context: SemanticValidationContext
): SemanticValidationError[] {
  const errors: SemanticValidationError[] = [];
  const { steps } = config;

  const ids = steps.map((s) => s.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push({ path: "steps", message: `IDs de etapa duplicados: ${[...new Set(duplicateIds)].join(", ")}` });
  }

  const orders = steps.map((s) => s.order);
  const duplicateOrders = orders.filter((o, index) => orders.indexOf(o) !== index);
  if (duplicateOrders.length > 0) {
    errors.push({ path: "steps", message: `Valores de order duplicados: ${[...new Set(duplicateOrders)].join(", ")}` });
  }

  const productSteps = enabledStepsOfType(steps, "PRODUCT");
  if (productSteps.length !== 1) {
    errors.push({
      path: "steps",
      message: `Deve existir exatamente uma etapa PRODUCT habilitada (encontradas: ${productSteps.length}).`,
    });
  }

  const successSteps = enabledStepsOfType(steps, "SUCCESS");
  if (successSteps.length !== 1) {
    errors.push({
      path: "steps",
      message: `Deve existir exatamente uma etapa SUCCESS habilitada (encontradas: ${successSteps.length}).`,
    });
  }

  const codFormSteps = enabledStepsOfType(steps, "COD_FORM");
  if (codFormSteps.length > 0) {
    const validPaymentChoice = enabledStepsOfType(steps, "PAYMENT_CHOICE").some(
      (s) => s.config.allowCod
    );
    if (!validPaymentChoice) {
      errors.push({
        path: "steps",
        message: "COD_FORM exige uma etapa PAYMENT_CHOICE habilitada com allowCod=true.",
      });
    }
  }

  const upsellSteps = enabledStepsOfType(steps, "UPSELL");
  if (upsellSteps.length > 0) {
    const hasUpsellProduct = context.funnelProducts.some((p) => p.role === "UPSELL");
    if (!hasUpsellProduct) {
      errors.push({
        path: "steps",
        message: "UPSELL exige ao menos um FunnelProduct com role UPSELL associado ao funil.",
      });
    }
  }

  for (const paymentStep of enabledStepsOfType(steps, "PAYMENT_CHOICE")) {
    if (!paymentStep.config.allowCod && !paymentStep.config.allowOnlinePayment) {
      errors.push({
        path: `steps.${paymentStep.id}`,
        message: "PAYMENT_CHOICE precisa permitir ao menos um método de pagamento.",
      });
    }
  }

  for (const rewardStep of enabledStepsOfType(steps, "REWARD")) {
    const progress = rewardStep.config.initialProgress;
    if (progress < 0 || progress > 100) {
      errors.push({
        path: `steps.${rewardStep.id}.config.initialProgress`,
        message: "initialProgress deve estar entre 0 e 100.",
      });
    }
  }

  for (const ref of context.funnelProducts) {
    if (ref.product.workspaceId !== context.workspaceId) {
      errors.push({
        path: "funnelProducts",
        message: `Produto ${ref.productId} pertence a outro workspace.`,
      });
    }
    if (ref.product.shopifyStoreId !== context.shopifyStoreId) {
      errors.push({
        path: "funnelProducts",
        message: `Produto ${ref.productId} pertence a uma loja diferente da do funil.`,
      });
    }
  }

  return errors;
}
