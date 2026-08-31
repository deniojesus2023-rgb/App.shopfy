import type { FunnelStep } from "@/modules/funnels/config/steps";
import type { SemanticValidationError } from "@/modules/funnels/config/semantic-validation";

/**
 * Heurística best-effort para apontar, na sidebar, qual etapa está
 * relacionada a um erro semântico. Regras específicas de uma etapa
 * (`steps.<id>...`) mapeiam direto pelo id; regras que falam do funil como
 * um todo (contagem de PRODUCT/SUCCESS, exigência de COD_FORM/UPSELL)
 * mapeiam pelo tipo mencionado na mensagem. Erros que não batem em nada
 * (ex.: IDs/order duplicados) ficam só no resumo geral — não é possível
 * apontar uma única etapa culpada com segurança.
 */
export function getStepErrors(
  step: FunnelStep,
  errors: SemanticValidationError[]
): SemanticValidationError[] {
  return errors.filter((error) => {
    const [, pathStepId] = error.path.split(".");
    if (pathStepId === step.id) return true;
    if (error.path === "steps" && error.message.includes(step.type)) return true;
    return false;
  });
}

export function hasStepErrors(step: FunnelStep, errors: SemanticValidationError[]): boolean {
  return getStepErrors(step, errors).length > 0;
}
