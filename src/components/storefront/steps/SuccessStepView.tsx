"use client";

import { useState } from "react";

import { PrimaryButton } from "../buttons";
import { StepHeader } from "../StepHeader";
import { isSoftButtonStyle } from "../theme";
import type { SuccessStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

function generateDemoOrderNumber(): string {
  return `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function SuccessStepView({
  config,
  theme,
  hasNextStep,
  onContinue,
}: {
  config: SuccessStepConfig;
  theme: FunnelTheme;
  hasNextStep: boolean;
  onContinue: () => void;
}) {
  // Lazy init: gerado uma vez, estável entre re-renders deste step.
  const [orderNumber] = useState(generateDemoOrderNumber);

  return (
    <div className="flex flex-col gap-6 px-5 py-8 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50"
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="rgb(4 120 87)" className="h-7 w-7">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <StepHeader title={config.title} subtitle={config.subtitle} />

      <div
        role="status"
        className="rounded-[var(--storefront-radius)] border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900"
      >
        <p className="font-semibold">Modo de demostración</p>
        <p>No se ha creado ningún pedido real.</p>
      </div>

      {config.showOrderNumber && (
        <p className="text-sm opacity-70">
          N.º de pedido (DEMO): <span className="font-mono font-medium">{orderNumber}</span>
        </p>
      )}

      {hasNextStep && (
        <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onContinue}>
          {config.ctaText ?? "CONTINUAR"}
        </PrimaryButton>
      )}
    </div>
  );
}
