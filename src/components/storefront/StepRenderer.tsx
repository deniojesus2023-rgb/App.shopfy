import type { FunnelStep } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { ResolvedProductSnapshot, ResolvedUpsellProduct } from "@/modules/funnels/runtime/resolve";
import type { OrderConfirmation, RuntimeState } from "@/modules/funnels/runtime/state";
import { CodFormStepView } from "./steps/CodFormStepView";
import { OfferStepView } from "./steps/OfferStepView";
import { PaymentChoiceStepView } from "./steps/PaymentChoiceStepView";
import { ProductStepView } from "./steps/ProductStepView";
import { RewardStepView } from "./steps/RewardStepView";
import { SuccessStepView } from "./steps/SuccessStepView";
import { UpsellStepView } from "./steps/UpsellStepView";

export interface StepRendererCallbacks {
  onContinue: () => void;
  onSelectOffer: (offerId: string, quantity: number) => void;
  onSelectPaymentMethod: (method: "COD" | "ONLINE") => void;
  onUnlockReward: () => void;
  onCodSubmitted: (order: OrderConfirmation) => void;
  onAcceptUpsell: () => void;
  onDeclineUpsell: () => void;
}

/**
 * Único ponto de despacho `step.type -> componente`. Nenhum outro lugar do
 * runtime decide isso — nunca um `if/else` de tipos de etapa espalhado
 * pelas páginas.
 */
export function StepRenderer({
  step,
  state,
  theme,
  snapshot,
  currency,
  offerConfig,
  upsellProduct,
  hasNextStep,
  callbacks,
  funnelPublicId,
  isPreview,
}: {
  step: FunnelStep;
  state: RuntimeState;
  theme: FunnelTheme;
  snapshot: ResolvedProductSnapshot;
  currency: string;
  /** Etapa OFFER habilitada do funil (se houver) — alimenta o preço padrão mostrado no PRODUCT step. */
  offerConfig: Extract<FunnelStep, { type: "OFFER" }>["config"] | null;
  upsellProduct: ResolvedUpsellProduct | null;
  hasNextStep: boolean;
  callbacks: StepRendererCallbacks;
  /** Necessário para o POST real de checkout (Fase 3) — identidade pública do funil. */
  funnelPublicId: string;
  /** Builder administrativo: nunca cria pedido real via CodFormStepView. */
  isPreview: boolean;
}) {
  switch (step.type) {
    case "PRODUCT":
      return (
        <ProductStepView
          config={step.config}
          snapshot={snapshot}
          currency={currency}
          offerConfig={offerConfig}
          theme={theme}
          onContinue={callbacks.onContinue}
        />
      );
    case "REWARD":
      return (
        <RewardStepView
          config={step.config}
          theme={theme}
          progress={state.rewardProgress}
          unlocked={state.rewardUnlocked}
          onUnlock={callbacks.onUnlockReward}
          onContinue={callbacks.onContinue}
        />
      );
    case "OFFER":
      return (
        <OfferStepView
          config={step.config}
          theme={theme}
          unitPrice={snapshot.unitPrice}
          currency={currency}
          selectedOfferId={state.selectedOfferId}
          onSelect={callbacks.onSelectOffer}
          onContinue={callbacks.onContinue}
        />
      );
    case "PAYMENT_CHOICE":
      return (
        <PaymentChoiceStepView
          config={step.config}
          theme={theme}
          selected={state.selectedPaymentMethod}
          onSelect={callbacks.onSelectPaymentMethod}
          onContinue={callbacks.onContinue}
        />
      );
    case "COD_FORM":
      return (
        <CodFormStepView
          config={step.config}
          theme={theme}
          onSubmitted={callbacks.onCodSubmitted}
          funnelPublicId={funnelPublicId}
          funnelVersionId={state.funnelVersionId}
          checkoutAttemptId={state.checkoutAttemptId}
          selectedPaymentMethod={state.selectedPaymentMethod}
          selectedOfferId={state.selectedOfferId}
          isPreview={isPreview}
        />
      );
    case "SUCCESS":
      return (
        <SuccessStepView
          config={step.config}
          theme={theme}
          hasNextStep={hasNextStep}
          order={state.lastOrder}
          onContinue={callbacks.onContinue}
        />
      );
    case "UPSELL":
      return (
        <UpsellStepView
          config={step.config}
          theme={theme}
          product={upsellProduct}
          onAccept={callbacks.onAcceptUpsell}
          onDecline={callbacks.onDeclineUpsell}
        />
      );
    default: {
      const _exhaustive: never = step;
      throw new Error(`Tipo de etapa desconhecido: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
