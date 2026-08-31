"use client";

import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Gift,
  Layers,
  Package,
  Palette,
  Sparkles,
} from "lucide-react";

import type { FunnelStepType } from "@/modules/funnels/config/steps";
import type { SemanticValidationError } from "@/modules/funnels/config/semantic-validation";
import { STEP_TYPE_LABELS, type BuilderAction, type BuilderState } from "./builder-state";
import { ReorderControls } from "./components/ReorderControls";
import { hasStepErrors } from "./validation-mapping";

const STEP_ICONS: Record<FunnelStepType, typeof Package> = {
  PRODUCT: Package,
  REWARD: Gift,
  OFFER: Layers,
  PAYMENT_CHOICE: CreditCard,
  COD_FORM: ClipboardList,
  SUCCESS: CheckCircle2,
  UPSELL: Sparkles,
};

export function StepSidebar({
  state,
  dispatch,
  semanticErrors,
  readOnly,
}: {
  state: BuilderState;
  dispatch: (action: BuilderAction) => void;
  semanticErrors: SemanticValidationError[];
  readOnly: boolean;
}) {
  const orderedSteps = [...state.draftConfig.steps].sort((a, b) => a.order - b.order);

  return (
    <nav aria-label="Etapas do funil" className="flex flex-col gap-1">
      {orderedSteps.map((step, index) => {
        const Icon = STEP_ICONS[step.type];
        const isSelected = state.selected.kind === "step" && state.selected.stepId === step.id;
        const hasError = hasStepErrors(step, semanticErrors);

        return (
          <div
            key={step.id}
            className={`flex items-center gap-1 rounded-md pr-1 ${isSelected ? "bg-neutral-100" : ""}`}
          >
            <button
              type="button"
              onClick={() => dispatch({ type: "SELECT_STEP", stepId: step.id })}
              aria-current={isSelected ? "true" : undefined}
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={step.enabled ? "" : "text-neutral-400"}>{STEP_TYPE_LABELS[step.type]}</span>
              {hasError && (
                <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500" title="Há um problema nesta etapa" />
              )}
            </button>
            {!readOnly && (
              <>
                <label className="sr-only" htmlFor={`enabled-${step.id}`}>
                  {STEP_TYPE_LABELS[step.type]} habilitada
                </label>
                <input
                  id={`enabled-${step.id}`}
                  type="checkbox"
                  checked={step.enabled}
                  onChange={() => dispatch({ type: "TOGGLE_STEP_ENABLED", stepId: step.id })}
                  aria-label={`Habilitar ${STEP_TYPE_LABELS[step.type]}`}
                />
                <ReorderControls
                  label={STEP_TYPE_LABELS[step.type]}
                  disableUp={index === 0}
                  disableDown={index === orderedSteps.length - 1}
                  onMoveUp={() => dispatch({ type: "MOVE_STEP", stepId: step.id, direction: "up" })}
                  onMoveDown={() => dispatch({ type: "MOVE_STEP", stepId: step.id, direction: "down" })}
                />
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => dispatch({ type: "SELECT_THEME" })}
        aria-current={state.selected.kind === "theme" ? "true" : undefined}
        className={`mt-2 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-50 ${
          state.selected.kind === "theme" ? "bg-neutral-100" : ""
        }`}
      >
        <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
        Diseño
      </button>
    </nav>
  );
}
