import { Badge } from "../Badge";
import { PrimaryButton } from "../buttons";
import { StorefrontCard } from "../Card";
import { isSoftButtonStyle } from "../theme";
import { isCheckoutProviderReady } from "@/modules/funnels/config/checkout-provider";
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
  onSelect,
  onContinue,
}: {
  config: PaymentChoiceStepConfig;
  theme: FunnelTheme;
  /** Total já resolvido da oferta selecionada — o preço exibido por método deriva sempre daqui, nunca de um valor digitado. */
  offerTotal: number;
  currency: string;
  selected: string | null;
  isPreview: boolean;
  onSelect: (paymentMethodId: string) => void;
  onContinue: () => void;
}) {
  const visibleMethods = config.paymentMethods.filter(
    (m) => m.enabled && (isPreview || isCheckoutProviderReady(m.provider))
  );

  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Forma de pago</legend>

        {visibleMethods.map((method) => {
          const resolved = resolvePaymentMethodPrice(offerTotal, method.pricing);
          const ready = isCheckoutProviderReady(method.provider);
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

      <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onContinue} disabled={!selected}>
        CONTINUAR
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
