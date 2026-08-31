"use client";

import { FunnelRuntime } from "@/components/storefront/FunnelRuntime";
import type { ResolvedFunnel } from "@/modules/funnels/runtime/resolve";
import { getEnabledSteps } from "@/modules/funnels/runtime/state";
import { Button } from "@/components/ui/button";
import type { BuilderAction, BuilderState } from "./builder-state";
import type { UpsellProductRef } from "./editors/UpsellEditor";

const DEVICE_WIDTH = { mobile: 390, desktop: 900 };

export function PreviewPanel({
  state,
  dispatch,
  funnelMeta,
  snapshot,
  upsellProduct,
}: {
  state: BuilderState;
  dispatch: (action: BuilderAction) => void;
  funnelMeta: { id: string; name: string; slug: string; publicId: string; versionId: string };
  snapshot: ResolvedFunnel["snapshot"];
  upsellProduct: UpsellProductRef | null;
}) {
  const enabledSteps = getEnabledSteps(state.draftConfig.steps);
  const selected = state.selected;
  const forcedStepId =
    selected.kind === "step" && enabledSteps.some((s) => s.id === selected.stepId) ? selected.stepId : undefined;

  // Chave estável enquanto a estrutura (quais etapas existem/habilitadas/
  // ordem) não muda — evita remontar o runtime a cada tecla digitada, mas
  // garante um estado novo quando a estrutura muda o suficiente para
  // invalidar a etapa atual do preview.
  const structuralKey = enabledSteps.map((s) => s.id).join(",");

  const resolved: ResolvedFunnel = {
    funnel: { id: funnelMeta.id, name: funnelMeta.name, slug: funnelMeta.slug, publicId: funnelMeta.publicId },
    version: { id: funnelMeta.versionId, versionNumber: 0 },
    config: state.draftConfig,
    snapshot,
    upsellProduct: upsellProduct ? { title: upsellProduct.title, featuredImageUrl: upsellProduct.featuredImageUrl } : null,
    isPreview: true,
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-center gap-1 rounded-full bg-neutral-100 p-1 text-sm">
        <Button
          type="button"
          size="sm"
          variant={state.previewDevice === "mobile" ? "default" : "ghost"}
          onClick={() => dispatch({ type: "SET_PREVIEW_DEVICE", device: "mobile" })}
          aria-pressed={state.previewDevice === "mobile"}
        >
          Mobile
        </Button>
        <Button
          type="button"
          size="sm"
          variant={state.previewDevice === "desktop" ? "default" : "ghost"}
          onClick={() => dispatch({ type: "SET_PREVIEW_DEVICE", device: "desktop" })}
          aria-pressed={state.previewDevice === "desktop"}
        >
          Desktop
        </Button>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto rounded-lg bg-neutral-100 p-4">
        <div
          className="overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-sm"
          style={{ width: DEVICE_WIDTH[state.previewDevice], maxWidth: "100%" }}
        >
          <FunnelRuntime
            key={structuralKey}
            resolved={resolved}
            forcedStepId={forcedStepId}
            disableSessionPersistence
          />
        </div>
      </div>
    </div>
  );
}
