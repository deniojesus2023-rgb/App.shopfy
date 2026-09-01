import { describe, expect, it } from "vitest";

import { getStepErrors, hasStepErrors } from "./validation-mapping";
import type { FunnelStep } from "@/modules/funnels/config/steps";
import type { SemanticValidationError } from "@/modules/funnels/config/semantic-validation";

function productStep(id: string): FunnelStep {
  return {
    id,
    type: "PRODUCT",
    enabled: true,
    order: 0,
    config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "Comprar" },
  };
}

function paymentStep(id: string): FunnelStep {
  return {
    id,
    type: "PAYMENT_CHOICE",
    enabled: true,
    order: 1,
    config: {
      paymentMethods: [
        { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "COD", pricing: { type: "NONE" } },
      ],
    },
  };
}

describe("getStepErrors / hasStepErrors", () => {
  it("mapeia erros por steps.<id> diretamente para a etapa correspondente", () => {
    const step = paymentStep("payment-1");
    const errors: SemanticValidationError[] = [
      { path: "steps.payment-1", message: "algo errado" },
      { path: "steps.other-id", message: "outro problema" },
    ];
    expect(getStepErrors(step, errors)).toEqual([{ path: "steps.payment-1", message: "algo errado" }]);
    expect(hasStepErrors(step, errors)).toBe(true);
  });

  it("mapeia erros com path 'steps.<id>.config...' também por prefixo do id", () => {
    const step = paymentStep("payment-1");
    const errors: SemanticValidationError[] = [
      { path: "steps.payment-1.config.initialProgress", message: "progresso inválido" },
    ];
    expect(getStepErrors(step, errors)).toHaveLength(1);
  });

  it("mapeia erro genérico 'steps' pelo tipo mencionado na mensagem", () => {
    const step = productStep("product-1");
    const errors: SemanticValidationError[] = [{ path: "steps", message: "Requer exatamente uma etapa PRODUCT habilitada" }];
    expect(hasStepErrors(step, errors)).toBe(true);
  });

  it("não associa erro genérico 'steps' que não menciona o tipo da etapa", () => {
    const step = productStep("product-1");
    const errors: SemanticValidationError[] = [{ path: "steps", message: "Requer exatamente uma etapa SUCCESS habilitada" }];
    expect(hasStepErrors(step, errors)).toBe(false);
  });

  it("erros sem etapa identificável (ex.: IDs/order duplicados) não batem em nenhuma etapa específica", () => {
    const step = productStep("product-1");
    const errors: SemanticValidationError[] = [{ path: "steps", message: "IDs de etapa duplicados: x, y" }];
    expect(hasStepErrors(step, errors)).toBe(false);
  });

  it("sem erros retorna array vazio e hasStepErrors false", () => {
    const step = productStep("product-1");
    expect(getStepErrors(step, [])).toEqual([]);
    expect(hasStepErrors(step, [])).toBe(false);
  });
});
