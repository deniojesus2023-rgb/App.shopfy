"use client";

import { useState } from "react";

import { Badge } from "../Badge";
import { PrimaryButton } from "../buttons";
import { StorefrontCard } from "../Card";
import { isSoftButtonStyle } from "../theme";
import { isCheckoutProviderReady, type CheckoutReadinessContext } from "@/modules/funnels/config/checkout-provider";
import type { PaymentChoiceStepConfig, PaymentMethodConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { resolvePaymentMethodPrice } from "@/modules/funnels/pricing/resolve-payment-method-price";
import { formatMoneyForDisplay } from "@/modules/shared/money";

/**
 * Público (storefront real) só pode ver/selecionar método `enabled` E com
 * provider `ready` — fail closed (spec Fase 4C item 20): nenhum botão de
 * checkout quebrado chega ao consumidor. O Builder preview vê TODOS os
 * métodos habilitados (mesmo não-ready), com um badge explicando o motivo
 * — nunca confunde "visível no preview" com "disponível ao público".
 */
export function PaymentChoiceStepView({
  config,
  theme,
  offerTotal,
  currency,
  selected,
  isPreview,
  readiness,
  onSelect,
  onContinue,
  onOnlineCheckout = null,
}: {
  config: PaymentChoiceStepConfig;
  theme: FunnelTheme;
  /** Total já resolvido da oferta selecionada — o preço exibido por método deriva sempre daqui, nunca de um valor digitado. */
  offerTotal: number;
  currency: string;
  selected: string | null;
  isPreview: boolean;
  /** Readiness calculada no servidor (Fase 4D) — nunca lida de env aqui. */
  readiness: CheckoutReadinessContext;
  onSelect: (paymentMethodId: string) => void;
  onContinue: () => void;
  /**
   * Só usado quando o método selecionado é ONLINE (Fase 4D): prepara o
   * checkout no servidor e devolve a URL para onde redirecionar. Nunca
   * calcula preço no client — o servidor é a autoridade. `null` no
   * preview do Builder, que nunca cria draft order real.
   */
  onOnlineCheckout?: ((paymentMethodId: string) => Promise<void>) | null;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const selectedMethod = config.paymentMethods.find((m) => m.id === selected) ?? null;
  const isOnlineSelected = selectedMethod?.method === "ONLINE";

  async function handleContinue() {
    setCheckoutError(null);

    if (!isOnlineSelected || !selectedMethod) {
      // COD (ou preview): segue o fluxo interno normal — próxima etapa é o
      // nosso formulário COD.
      onContinue();
      return;
    }

    if (!onOnlineCheckout) {
      // Preview do Builder: nunca cria checkout real nem redireciona.
      setCheckoutError("Vista previa: el checkout en línea no se abre aquí.");
      return;
    }

    setIsRedirecting(true);
    try {
      await onOnlineCheckout(selectedMethod.id);
    } catch {
      setCheckoutError("No pudimos preparar el pago en línea. Inténtalo nuevamente.");
    } finally {
      setIsRedirecting(false);
    }
  }
  const visibleMethods = config.paymentMethods.filter(
    (m) => m.enabled && (isPreview || isCheckoutProviderReady(m.provider, readiness))
  );

  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Forma de pago</legend>

        {visibleMethods.map((method) => {
          const resolved = resolvePaymentMethodPrice(offerTotal, method.pricing);
          const ready = isCheckoutProviderReady(method.provider, readiness);
          return (
            <PaymentMethodOption
              key={method.id}
              method={method}
              resolved={resolved}
              currency={currency}
              ready={ready}
              recommended={config.recommendedMethodId === method.id}
              selected={selected === method.id}
              onSelect={() => onSelect(method.id)}
            />
          );
        })}
      </fieldset>

      {isOnlineSelected && (
        // Honestidade sobre frete/imposto (Fase 4D item 15): o nosso quote
        // é só MERCADORIA — a Shopify soma frete/impostos no checkout dela
        // conforme a configuração da loja. Nunca prometer "total final".
        <p className="text-xs opacity-60">
          El envío y los impuestos se calculan en el checkout.
        </p>
      )}

      {checkoutError && (
        <p role="alert" className="text-sm text-red-600">
          {checkoutError}
        </p>
      )}

      <PrimaryButton
        soft={isSoftButtonStyle(theme)}
        onClick={handleContinue}
        disabled={!selected || isRedirecting}
      >
        {isRedirecting ? "Redirigiendo..." : isOnlineSelected ? "PAGAR POR EL SITIO" : "CONTINUAR"}
      </PrimaryButton>
    </div>
  );
}

function PaymentMethodOption({
  method,
  resolved,
  currency,
  ready,
  recommended,
  selected,
  onSelect,
}: {
  method: PaymentMethodConfig;
  resolved: { total: number; discount: number };
  currency: string;
  ready: boolean;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="block cursor-pointer">
      <input
        type="radio"
        name="payment-method"
        className="sr-only"
        checked={selected}
        onChange={onSelect}
        disabled={!ready}
      />
      <StorefrontCard selected={selected} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{method.label}</span>
          {recommended && <Badge>Recomendado</Badge>}
          {!ready && <Badge>No conectado</Badge>}
        </div>
        {method.description && <p className="text-sm opacity-70">{method.description}</p>}
        <div className="flex items-center gap-2">
          <span className="font-semibold">{formatMoneyForDisplay(resolved.total, currency)}</span>
          {resolved.discount > 0 && (
            <span className="text-sm text-emerald-700">Ahorras {formatMoneyForDisplay(resolved.discount, currency)} adicionales</span>
          )}
        </div>
      </StorefrontCard>
    </label>
  );
}
