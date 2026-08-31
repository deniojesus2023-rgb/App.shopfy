import { Badge } from "../Badge";
import { PrimaryButton } from "../buttons";
import { StorefrontCard } from "../Card";
import { PriceDisplay } from "../PriceDisplay";
import { isSoftButtonStyle } from "../theme";
import type { OfferStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { resolveOfferPrice } from "@/modules/funnels/pricing/resolve-offer-price";

export function OfferStepView({
  config,
  theme,
  unitPrice,
  currency,
  selectedOfferId,
  onSelect,
  onContinue,
}: {
  config: OfferStepConfig;
  theme: FunnelTheme;
  unitPrice: number;
  currency: string;
  selectedOfferId: string | null;
  onSelect: (offerId: string, quantity: number) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Escolha a quantidade</legend>
        {config.offers.map((offer) => {
          const selected = offer.id === selectedOfferId;
          const resolved = resolveOfferPrice(unitPrice, offer);
          // Preço "de/por" só quando há desconto real (nunca sobretaxa, e
          // nunca a economia escrita pelo lojista — sempre derivada aqui).
          const compareAtPrice = resolved.discount > 0 ? resolved.referenceSubtotal : null;
          return (
            <label key={offer.id} className="block cursor-pointer">
              <input
                type="radio"
                name="offer"
                value={offer.id}
                checked={selected}
                onChange={() => onSelect(offer.id, offer.quantity)}
                className="sr-only"
              />
              <StorefrontCard
                selected={selected}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{offer.label}</span>
                    {offer.badge && <Badge>{offer.badge}</Badge>}
                  </div>
                </div>
                <PriceDisplay price={resolved.total} compareAtPrice={compareAtPrice} currency={currency} />
              </StorefrontCard>
            </label>
          );
        })}
      </fieldset>

      <PrimaryButton
        soft={isSoftButtonStyle(theme)}
        onClick={onContinue}
        disabled={!selectedOfferId}
      >
        CONTINUAR
      </PrimaryButton>
    </div>
  );
}
