import type { FunnelStep } from "../config/steps";

export interface OrderConfirmation {
  publicOrderId: string;
  orderNumber: number;
  status: string;
  total: string;
  currency: string;
}

export interface RuntimeState {
  sessionId: string;
  funnelId: string;
  funnelVersionId: string;
  currentStepId: string;
  completedStepIds: string[];
  selectedOfferId: string | null;
  selectedQuantity: number | null;
  selectedPaymentMethod: "COD" | "ONLINE" | null;
  upsellAccepted: boolean | null;
  // Gerado 1x ao criar a sessão, nunca depois — o backend deriva a chave de
  // idempotência local a partir disto (Fase 3). Não é PII: um UUID
  // aleatório, sem relação com o cliente, seguro em sessionStorage.
  checkoutAttemptId: string;
  // Preenchido só depois que o Order local foi REALMENTE criado no
  // servidor (Fase 3) — SUCCESS não pode afirmar "pedido confirmado" antes
  // disso (spec item 16/29).
  lastOrder: OrderConfirmation | null;
}

export type RuntimeAction =
  | { type: "NEXT_STEP"; steps: FunnelStep[] }
  | { type: "PREVIOUS_STEP"; steps: FunnelStep[] }
  | { type: "GO_TO_STEP"; stepId: string; steps: FunnelStep[] }
  | { type: "SELECT_OFFER"; offerId: string; quantity: number }
  | { type: "SELECT_PAYMENT_METHOD"; method: "COD" | "ONLINE" }
  | { type: "ACCEPT_UPSELL" }
  | { type: "DECLINE_UPSELL" }
  | { type: "ORDER_CONFIRMED"; order: OrderConfirmation }
  // Substitui o estado inteiro por uma sessão restaurada do sessionStorage
  // (já validada pelo caller: mesma funnelVersionId). Único jeito de repor
  // seleções/etapa/progresso de uma vez sem reconstruir passo a passo.
  | { type: "RESTORE"; state: RuntimeState }
  // Pula direto para uma etapa SEM checar `canNavigateToStep` — só para o
  // preview do builder administrativo (o admin pode inspecionar qualquer
  // etapa livremente). O storefront público real nunca despacha isto.
  | { type: "JUMP"; stepId: string };

/** Etapas habilitadas, na ordem em que o consumidor navega — único lugar que decide essa ordem. */
export function getEnabledSteps(steps: FunnelStep[]): FunnelStep[] {
  return [...steps].filter((s) => s.enabled).sort((a, b) => a.order - b.order);
}

function stepIndex(steps: FunnelStep[], stepId: string): number {
  return getEnabledSteps(steps).findIndex((s) => s.id === stepId);
}

/**
 * Só permite ir para uma etapa já alcançada (`completedStepIds`) ou para a
 * etapa atual — nunca pular à frente para uma etapa nunca visitada. Isso é
 * o que impede, por exemplo, um consumidor forçar a URL/estado direto para
 * SUCCESS sem passar pelo COD_FORM.
 */
export function canNavigateToStep(state: RuntimeState, steps: FunnelStep[], stepId: string): boolean {
  if (stepId === state.currentStepId) return true;
  return state.completedStepIds.includes(stepId) && stepIndex(steps, stepId) >= 0;
}

export function createInitialRuntimeState(params: {
  sessionId: string;
  funnelId: string;
  funnelVersionId: string;
  steps: FunnelStep[];
  checkoutAttemptId: string;
}): RuntimeState {
  const enabled = getEnabledSteps(params.steps);
  return {
    sessionId: params.sessionId,
    funnelId: params.funnelId,
    funnelVersionId: params.funnelVersionId,
    currentStepId: enabled[0]?.id ?? "",
    completedStepIds: [],
    selectedOfferId: null,
    selectedQuantity: null,
    selectedPaymentMethod: null,
    upsellAccepted: null,
    checkoutAttemptId: params.checkoutAttemptId,
    lastOrder: null,
  };
}

export function runtimeReducer(state: RuntimeState, action: RuntimeAction): RuntimeState {
  switch (action.type) {
    case "NEXT_STEP": {
      const enabled = getEnabledSteps(action.steps);
      const currentIndex = enabled.findIndex((s) => s.id === state.currentStepId);
      const next = enabled[currentIndex + 1];
      if (!next) return state;
      return {
        ...state,
        completedStepIds: state.completedStepIds.includes(state.currentStepId)
          ? state.completedStepIds
          : [...state.completedStepIds, state.currentStepId],
        currentStepId: next.id,
      };
    }
    case "PREVIOUS_STEP": {
      const enabled = getEnabledSteps(action.steps);
      const currentIndex = enabled.findIndex((s) => s.id === state.currentStepId);
      const previous = enabled[currentIndex - 1];
      if (!previous) return state;
      return { ...state, currentStepId: previous.id };
    }
    case "GO_TO_STEP": {
      if (!canNavigateToStep(state, action.steps, action.stepId)) return state;
      return { ...state, currentStepId: action.stepId };
    }
    case "SELECT_OFFER":
      return { ...state, selectedOfferId: action.offerId, selectedQuantity: action.quantity };
    case "SELECT_PAYMENT_METHOD":
      return { ...state, selectedPaymentMethod: action.method };
    case "ACCEPT_UPSELL":
      return { ...state, upsellAccepted: true };
    case "DECLINE_UPSELL":
      return { ...state, upsellAccepted: false };
    case "ORDER_CONFIRMED":
      return { ...state, lastOrder: action.order };
    case "RESTORE":
      return action.state;
    case "JUMP":
      return { ...state, currentStepId: action.stepId };
    default:
      return state;
  }
}
