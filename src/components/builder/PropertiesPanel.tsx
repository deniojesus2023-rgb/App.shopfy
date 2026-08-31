"use client";

import { STEP_TYPE_LABELS, type BuilderAction, type BuilderState } from "./builder-state";
import type { UpsellProductRef } from "./editors/UpsellEditor";
import { CodFormEditor } from "./editors/CodFormEditor";
import { OfferStepEditor } from "./editors/OfferStepEditor";
import { PaymentChoiceEditor } from "./editors/PaymentChoiceEditor";
import { ProductStepEditor } from "./editors/ProductStepEditor";
import { RewardStepEditor } from "./editors/RewardStepEditor";
import { SuccessEditor } from "./editors/SuccessEditor";
import { ThemeEditor } from "./editors/ThemeEditor";
import { UpsellEditor } from "./editors/UpsellEditor";
import type { FunnelStep } from "@/modules/funnels/config/steps";

/**
 * Despacho único `step.type -> editor`, no mesmo espírito do StepRenderer
 * do storefront — nenhum outro lugar do builder decide isto.
 */
export function PropertiesPanel({
  state,
  dispatch,
  workspaceSlug,
  funnelId,
  shopifyStoreId,
  unitPrice,
  currency,
  upsellProduct,
  onUpsellProductChange,
}: {
  state: BuilderState;
  dispatch: (action: BuilderAction) => void;
  workspaceSlug: string;
  funnelId: string;
  shopifyStoreId: string;
  unitPrice: number;
  currency: string;
  upsellProduct: UpsellProductRef | null;
  onUpsellProductChange: (product: UpsellProductRef) => void;
}) {
  const selected = state.selected;

  if (selected.kind === "theme") {
    return (
      <div>
        <h2 className="mb-4 text-sm font-semibold text-neutral-500">Diseño</h2>
        <ThemeEditor theme={state.draftConfig.theme} onChange={(theme) => dispatch({ type: "UPDATE_THEME", theme })} />
      </div>
    );
  }

  const step = state.draftConfig.steps.find((s) => s.id === selected.stepId);
  if (!step) return null;

  function onChangeConfig(config: FunnelStep["config"]) {
    dispatch({ type: "UPDATE_STEP", stepId: step!.id, step: { ...step, config } as FunnelStep });
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-neutral-500">{STEP_TYPE_LABELS[step.type]}</h2>
      {step.type === "PRODUCT" && <ProductStepEditor config={step.config} onChange={onChangeConfig} />}
      {step.type === "REWARD" && <RewardStepEditor config={step.config} onChange={onChangeConfig} />}
      {step.type === "OFFER" && (
        <OfferStepEditor config={step.config} unitPrice={unitPrice} currency={currency} onChange={onChangeConfig} />
      )}
      {step.type === "PAYMENT_CHOICE" && <PaymentChoiceEditor config={step.config} onChange={onChangeConfig} />}
      {step.type === "COD_FORM" && <CodFormEditor config={step.config} onChange={onChangeConfig} />}
      {step.type === "SUCCESS" && <SuccessEditor config={step.config} onChange={onChangeConfig} />}
      {step.type === "UPSELL" && (
        <UpsellEditor
          config={step.config}
          onChange={onChangeConfig}
          workspaceSlug={workspaceSlug}
          funnelId={funnelId}
          shopifyStoreId={shopifyStoreId}
          upsellProduct={upsellProduct}
          onUpsellProductChange={onUpsellProductChange}
        />
      )}
    </div>
  );
}
