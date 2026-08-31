import { PrimaryButton } from "../buttons";
import { StepHeader } from "../StepHeader";
import { isSoftButtonStyle } from "../theme";
import type { RewardStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

export function RewardStepView({
  config,
  theme,
  progress,
  unlocked,
  onUnlock,
  onContinue,
}: {
  config: RewardStepConfig;
  theme: FunnelTheme;
  progress: number;
  unlocked: boolean;
  onUnlock: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 px-5 py-8">
      <StepHeader title={config.title} subtitle={config.subtitle} />

      <div className="flex flex-col items-center gap-3">
        <div
          className="text-3xl font-bold"
          style={{ color: "var(--storefront-primary)" }}
          aria-live="polite"
        >
          {config.rewardDisplayType === "PERCENTAGE" && `${config.displayValue}`}
          {config.rewardDisplayType === "CURRENCY" && config.displayValue}
          {config.rewardDisplayType === "GENERIC" && config.displayValue}
        </div>

        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%`, background: "var(--storefront-primary)" }}
          />
        </div>

        <p aria-live="polite" className="text-sm opacity-70">
          {unlocked ? "Benefício desbloqueado" : `${progress}% concluído`}
        </p>
      </div>

      <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={unlocked ? onContinue : onUnlock}>
        {unlocked ? "CONTINUAR" : config.ctaText}
      </PrimaryButton>
    </div>
  );
}
