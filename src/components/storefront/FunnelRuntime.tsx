"use client";

import { useEffect, useReducer } from "react";

import type { ResolvedFunnel } from "@/modules/funnels/runtime/resolve";
import {
  clearRuntimeSession,
  readRuntimeSession,
  writeRuntimeSession,
} from "@/modules/funnels/runtime/session-storage";
import {
  createInitialRuntimeState,
  getEnabledSteps,
  runtimeReducer,
  type RuntimeState,
} from "@/modules/funnels/runtime/state";
import { ProgressBar } from "./ProgressBar";
import { StepRenderer } from "./StepRenderer";
import { StorefrontShell } from "./StorefrontShell";

function findRewardInitialProgress(resolved: ResolvedFunnel): number {
  const rewardStep = resolved.config.steps.find((s) => s.type === "REWARD" && s.enabled);
  return rewardStep && rewardStep.type === "REWARD" ? rewardStep.config.initialProgress : 0;
}

export function FunnelRuntime({
  resolved,
  forcedStepId,
  disableSessionPersistence = false,
}: {
  resolved: ResolvedFunnel;
  /**
   * Só usado pelo preview do builder administrativo: sincroniza a etapa
   * exibida com a etapa selecionada no editor, pulando a checagem de
   * navegação (o admin pode inspecionar qualquer etapa). O storefront
   * público nunca passa isto.
   */
  forcedStepId?: string;
  /** Idem — o preview do builder não deve gravar/restaurar sessionStorage. */
  disableSessionPersistence?: boolean;
}) {
  const enabledSteps = getEnabledSteps(resolved.config.steps);

  const [state, dispatch] = useReducer(
    runtimeReducer,
    null,
    (): RuntimeState =>
      createInitialRuntimeState({
        sessionId: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36),
        funnelId: resolved.funnel.id,
        funnelVersionId: resolved.version.id,
        steps: resolved.config.steps,
        initialRewardProgress: findRewardInitialProgress(resolved),
        checkoutAttemptId: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36),
      })
  );

  // Restaura sessão salva só depois de montar (client-only) e só se ela
  // pertence exatamente a esta funnelVersionId — nunca mistura estado de
  // versões diferentes do mesmo funil.
  useEffect(() => {
    if (disableSessionPersistence) return;
    const restored = readRuntimeSession(resolved.funnel.id, resolved.version.id);
    if (restored) {
      dispatch({ type: "RESTORE", state: restored });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (disableSessionPersistence) return;
    writeRuntimeSession(state);
  }, [state, disableSessionPersistence]);

  useEffect(() => {
    if (forcedStepId && forcedStepId !== state.currentStepId) {
      dispatch({ type: "JUMP", stepId: forcedStepId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedStepId]);

  const currentIndex = enabledSteps.findIndex((s) => s.id === state.currentStepId);
  const currentStep = enabledSteps[currentIndex];
  const hasNextStep = currentIndex >= 0 && currentIndex < enabledSteps.length - 1;
  const offerStep = resolved.config.steps.find((s) => s.type === "OFFER" && s.enabled);
  const offerConfig = offerStep?.type === "OFFER" ? offerStep.config : null;

  if (!currentStep) {
    return null;
  }

  return (
    <StorefrontShell theme={resolved.config.theme}>
      <div className="px-5 pt-5">
        <ProgressBar current={currentIndex + 1} total={enabledSteps.length} />
      </div>
      <main className="flex flex-1 flex-col" aria-live="polite">
        <StepRenderer
          step={currentStep}
          state={state}
          theme={resolved.config.theme}
          snapshot={resolved.snapshot}
          currency={resolved.currency}
          offerConfig={offerConfig}
          upsellProduct={resolved.upsellProduct}
          hasNextStep={hasNextStep}
          funnelPublicId={resolved.funnel.publicId}
          isPreview={resolved.isPreview}
          callbacks={{
            onContinue: () => dispatch({ type: "NEXT_STEP", steps: resolved.config.steps }),
            onSelectOffer: (offerId, quantity) => dispatch({ type: "SELECT_OFFER", offerId, quantity }),
            onSelectPaymentMethod: (method) => dispatch({ type: "SELECT_PAYMENT_METHOD", method }),
            onUnlockReward: () => dispatch({ type: "UNLOCK_REWARD" }),
            onCodSubmitted: (order) => {
              dispatch({ type: "ORDER_CONFIRMED", order });
              dispatch({ type: "NEXT_STEP", steps: resolved.config.steps });
            },
            onAcceptUpsell: () => {
              dispatch({ type: "ACCEPT_UPSELL" });
              if (!disableSessionPersistence) clearRuntimeSession(resolved.funnel.id);
            },
            onDeclineUpsell: () => {
              dispatch({ type: "DECLINE_UPSELL" });
              if (!disableSessionPersistence) clearRuntimeSession(resolved.funnel.id);
            },
          }}
        />
      </main>
    </StorefrontShell>
  );
}
