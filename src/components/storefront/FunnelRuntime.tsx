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

export function FunnelRuntime({ resolved }: { resolved: ResolvedFunnel }) {
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
      })
  );

  // Restaura sessão salva só depois de montar (client-only) e só se ela
  // pertence exatamente a esta funnelVersionId — nunca mistura estado de
  // versões diferentes do mesmo funil.
  useEffect(() => {
    const restored = readRuntimeSession(resolved.funnel.id, resolved.version.id);
    if (restored) {
      dispatch({ type: "RESTORE", state: restored });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeRuntimeSession(state);
  }, [state]);

  const currentIndex = enabledSteps.findIndex((s) => s.id === state.currentStepId);
  const currentStep = enabledSteps[currentIndex];
  const hasNextStep = currentIndex >= 0 && currentIndex < enabledSteps.length - 1;

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
          upsellProduct={resolved.upsellProduct}
          hasNextStep={hasNextStep}
          callbacks={{
            onContinue: () => dispatch({ type: "NEXT_STEP", steps: resolved.config.steps }),
            onSelectOffer: (offerId, quantity) => dispatch({ type: "SELECT_OFFER", offerId, quantity }),
            onSelectPaymentMethod: (method) => dispatch({ type: "SELECT_PAYMENT_METHOD", method }),
            onUnlockReward: () => dispatch({ type: "UNLOCK_REWARD" }),
            onCodSubmitted: () => dispatch({ type: "NEXT_STEP", steps: resolved.config.steps }),
            onAcceptUpsell: () => {
              dispatch({ type: "ACCEPT_UPSELL" });
              clearRuntimeSession(resolved.funnel.id);
            },
            onDeclineUpsell: () => {
              dispatch({ type: "DECLINE_UPSELL" });
              clearRuntimeSession(resolved.funnel.id);
            },
          }}
        />
      </main>
    </StorefrontShell>
  );
}
