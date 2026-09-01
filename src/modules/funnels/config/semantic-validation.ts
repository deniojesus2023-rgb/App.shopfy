import { UNSUPPORTED_PRICING_REWARD_TYPES } from "./gamification";
import type { FunnelConfig } from "./schema";
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
  config: FunnelConfig,
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

  const offerSteps = enabledStepsOfType(steps, "OFFER");
  const offerIds = new Set(offerSteps.flatMap((s) => s.config.offers.map((o) => o.id)));

  for (const rewardStep of enabledStepsOfType(steps, "REWARD")) {
    const { progressRule, reward, milestones } = rewardStep.config;

    // PRICING_REWARD (FIXED_DISCOUNT/PERCENT_DISCOUNT): fail closed — não
    // há integração com calculateOrderQuote() ainda nesta fase (spec item
    // 15). Uma recompensa "econômica" que não muda Order.total de verdade
    // é exatamente a promessa falsa que este motor existe para eliminar.
    if ((UNSUPPORTED_PRICING_REWARD_TYPES as readonly string[]).includes(reward.type)) {
      errors.push({
        path: `steps.${rewardStep.id}.config.reward`,
        message: `Tipo de recompensa "${reward.type}" ainda não é suportado (requer integração com o Pricing Engine).`,
      });
    }

    if (progressRule.type === "OFFER_SELECTION_PROGRESS") {
      if (offerSteps.length === 0) {
        errors.push({
          path: `steps.${rewardStep.id}.config.progressRule`,
          message: "OFFER_SELECTION_PROGRESS exige uma etapa OFFER habilitada.",
        });
      }
      for (const offerId of Object.keys(progressRule.offerProgress)) {
        if (!offerIds.has(offerId)) {
          errors.push({
            path: `steps.${rewardStep.id}.config.progressRule.offerProgress.${offerId}`,
            message: `Oferta "${offerId}" referenciada não existe em nenhuma etapa OFFER habilitada.`,
          });
        }
      }
    }

    if (progressRule.type === "VALUE_THRESHOLD" && offerSteps.length === 0) {
      errors.push({
        path: `steps.${rewardStep.id}.config.progressRule`,
        message: "VALUE_THRESHOLD exige uma etapa OFFER habilitada (a economia deriva da oferta selecionada).",
      });
    }

    for (const milestone of milestones) {
      if (milestone.progress < 0 || milestone.progress > 100) {
        errors.push({
          path: `steps.${rewardStep.id}.config.milestones`,
          message: `Milestone "${milestone.label}" com progresso fora de 0-100 (${milestone.progress}).`,
        });
      }
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
