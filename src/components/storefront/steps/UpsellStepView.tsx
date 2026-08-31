import { PrimaryButton, SecondaryButton } from "../buttons";
import { ProductImage } from "../ProductImage";
import { StepHeader } from "../StepHeader";
import { isSoftButtonStyle } from "../theme";
import type { UpsellStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { ResolvedUpsellProduct } from "@/modules/funnels/runtime/resolve";

export function UpsellStepView({
  config,
  theme,
  product,
  onAccept,
  onDecline,
}: {
  config: UpsellStepConfig;
  theme: FunnelTheme;
  product: ResolvedUpsellProduct | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-5 py-8">
      {product && <ProductImage src={product.featuredImageUrl} alt={product.title} size="large" />}

      <StepHeader title={config.headline} subtitle={config.subheadline ?? product?.title} />

      <div className="flex flex-col gap-2">
        <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onAccept}>
          {config.ctaText}
        </PrimaryButton>
        <SecondaryButton onClick={onDecline}>{config.declineText}</SecondaryButton>
      </div>
    </div>
  );
}
