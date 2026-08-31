import { Badge } from "../Badge";
import { PrimaryButton } from "../buttons";
import { StorefrontCard } from "../Card";
import { isSoftButtonStyle } from "../theme";
import type { PaymentChoiceStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

export function PaymentChoiceStepView({
  config,
  theme,
  selected,
  onSelect,
  onContinue,
}: {
  config: PaymentChoiceStepConfig;
  theme: FunnelTheme;
  selected: "COD" | "ONLINE" | null;
  onSelect: (method: "COD" | "ONLINE") => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Forma de pagamento</legend>

        {config.allowCod && (
          <label className="block cursor-pointer">
            <input
              type="radio"
              name="payment-method"
              className="sr-only"
              checked={selected === "COD"}
              onChange={() => onSelect("COD")}
            />
            <StorefrontCard selected={selected === "COD"} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{config.codLabel}</span>
                {config.recommendedMethod === "COD" && <Badge>Recomendado</Badge>}
              </div>
              {config.codDescription && <p className="text-sm opacity-70">{config.codDescription}</p>}
            </StorefrontCard>
          </label>
        )}

        {config.allowOnlinePayment && (
          <label className="block cursor-pointer">
            <input
              type="radio"
              name="payment-method"
              className="sr-only"
              checked={selected === "ONLINE"}
              onChange={() => onSelect("ONLINE")}
            />
            <StorefrontCard selected={selected === "ONLINE"} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{config.onlinePaymentLabel}</span>
                {config.recommendedMethod === "ONLINE" && <Badge>Recomendado</Badge>}
                {config.onlinePaymentDiscountDisplay && <Badge>{config.onlinePaymentDiscountDisplay}</Badge>}
              </div>
              {config.onlinePaymentDescription && (
                <p className="text-sm opacity-70">{config.onlinePaymentDescription}</p>
              )}
            </StorefrontCard>
          </label>
        )}
      </fieldset>

      <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onContinue} disabled={!selected}>
        CONTINUAR
      </PrimaryButton>
    </div>
  );
}
