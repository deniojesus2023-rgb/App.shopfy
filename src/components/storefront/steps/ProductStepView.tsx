import { PrimaryButton } from "../buttons";
import { PriceDisplay } from "../PriceDisplay";
import { ProductImage } from "../ProductImage";
import type { OfferStepConfig, ProductStepConfig } from "@/modules/funnels/config/steps";
import type { ResolvedProductSnapshot } from "@/modules/funnels/runtime/resolve";
import { resolveOfferPrice } from "@/modules/funnels/pricing/resolve-offer-price";
import { isSoftButtonStyle } from "../theme";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill={i < rounded ? "var(--storefront-primary)" : "rgba(0,0,0,0.15)"}
          className="h-4 w-4"
        >
          <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * Preço mostrado: por padrão o do snapshot (comportamento pré-Fase 4A).
 * Se a etapa OFFER tem `defaultOfferId`, mostra o preço RESOLVIDO daquela
 * oferta (spec item 17) — nunca decide isto por posição no array. Nunca
 * pré-seleciona nada na etapa OFFER em si; é só o preço exibido aqui.
 */
function resolveDisplayPrice(
  snapshot: ResolvedProductSnapshot,
  showCompareAtPrice: boolean,
  offerConfig: OfferStepConfig | null
): { price: number; compareAtPrice: number | null | undefined } {
  const defaultOffer = offerConfig?.defaultOfferId
    ? offerConfig.offers.find((o) => o.id === offerConfig.defaultOfferId)
    : undefined;

  if (!defaultOffer) {
    return { price: snapshot.unitPrice, compareAtPrice: showCompareAtPrice ? snapshot.compareAtPrice : undefined };
  }

  const resolved = resolveOfferPrice(snapshot.unitPrice, defaultOffer);
  if (resolved.quantity === 1) {
    return { price: resolved.total, compareAtPrice: showCompareAtPrice ? snapshot.compareAtPrice : undefined };
  }
  // Bundle de mais de 1 unidade: o "de/por" compara com a referência do
  // PACOTE (unitPrice × quantity), não com o preço unitário do produto —
  // comparar um total de 3 unidades com o preço de 1 seria enganoso.
  return {
    price: resolved.total,
    compareAtPrice: showCompareAtPrice && resolved.discount > 0 ? resolved.referenceSubtotal : undefined,
  };
}

export function ProductStepView({
  config,
  snapshot,
  currency,
  offerConfig,
  theme,
  onContinue,
}: {
  config: ProductStepConfig;
  snapshot: ResolvedProductSnapshot;
  currency: string;
  offerConfig: OfferStepConfig | null;
  theme: FunnelTheme;
  onContinue: () => void;
}) {
  const display = resolveDisplayPrice(snapshot, config.showCompareAtPrice, offerConfig);

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <ProductImage src={snapshot.featuredImageUrl} alt={snapshot.title} size="large" />

      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-bold text-balance">{config.headline ?? snapshot.title}</h1>
        {config.subheadline && <p className="text-sm text-balance opacity-70">{config.subheadline}</p>}
      </div>

      {config.showRating && config.ratingValue != null && (
        <div className="flex items-center justify-center gap-2">
          <Stars value={config.ratingValue} />
          <span className="text-sm opacity-70">
            {config.ratingValue.toFixed(1)}
            {config.ratingCount != null && ` (${config.ratingCount.toLocaleString("pt-BR")})`}
          </span>
        </div>
      )}

      <div className="flex justify-center">
        <PriceDisplay price={display.price} compareAtPrice={display.compareAtPrice} currency={currency} size="lg" />
      </div>

      {config.showBenefits && config.benefits.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {config.benefits.map((benefit, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <svg
                viewBox="0 0 20 20"
                fill="var(--storefront-primary)"
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onContinue}>
        {config.ctaText}
      </PrimaryButton>
    </div>
  );
}
