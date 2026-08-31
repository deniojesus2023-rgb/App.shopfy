"use client";

import { PrimaryButton } from "../buttons";
import { StepHeader } from "../StepHeader";
import { isSoftButtonStyle } from "../theme";
import type { SuccessStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { OrderConfirmation } from "@/modules/funnels/runtime/state";

/**
 * A partir da Fase 3, esta tela só afirma que o pedido existe quando
 * `order` veio de um Order LOCAL realmente criado (ver CodFormStepView) —
 * nunca antes disso, e nunca "pedido enviado/despachado" (isso só acontece
 * quando a Shopify sincroniza e o fulfillment de fato existe, fora do
 * escopo desta fase). Sem `order` (funil sem COD_FORM habilitado, ou o
 * consumidor chegou aqui de outro jeito), a etapa mostra só o conteúdo de
 * config — nunca inventa um número de pedido.
 */
export function SuccessStepView({
  config,
  theme,
  hasNextStep,
  order,
  onContinue,
}: {
  config: SuccessStepConfig;
  theme: FunnelTheme;
  hasNextStep: boolean;
  order: OrderConfirmation | null;
  onContinue: () => void;
}) {
  const isPreviewOrder = order?.publicOrderId === "preview";

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

      {order && !isPreviewOrder && (
        <div
          role="status"
          className="rounded-[var(--storefront-radius)] border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-900"
        >
          <p className="font-semibold">¡Pedido confirmado!</p>
          <p>Pagas al recibir.</p>
        </div>
      )}

      {isPreviewOrder && (
        <p role="status" className="rounded-[var(--storefront-radius)] border border-neutral-200 bg-neutral-50 p-3 text-xs opacity-70">
          Vista previa — no se creará ningún pedido real.
        </p>
      )}

      {config.showOrderNumber && order && !isPreviewOrder && (
        <p className="text-sm opacity-70">
          N.º de pedido: <span className="font-mono font-medium">#{order.orderNumber}</span>
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
