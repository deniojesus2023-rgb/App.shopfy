import { PrimaryButton } from "../buttons";
import { StepHeader } from "../StepHeader";
import { isSoftButtonStyle } from "../theme";
import type { GamificationResult } from "@/modules/funnels/gamification/evaluate";
import { roundProgressForDisplay } from "@/modules/funnels/gamification/evaluate";
import type { RewardStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { formatMoneyForDisplay } from "@/modules/shared/money";

// COMPLETED (pedido local real) só pode dizer "desbloqueado". READY
// (progresso matemático em 100% sem pedido confirmado) nunca usa essa
// palavra — a matemática e a condição comercial de desbloqueio são coisas
// diferentes (Fase 4B).
const STATUS_MESSAGE: Record<GamificationResult["status"], string> = {
  LOCKED: "Continúa para avanzar",
  IN_PROGRESS: "Sigue avanzando",
  READY: "Todo listo para finalizar",
  COMPLETED: "Recompensa desbloqueada",
};

export function RewardStepView({
  config,
  theme,
  currency,
  result,
  onContinue,
}: {
  config: RewardStepConfig;
  theme: FunnelTheme;
  currency: string;
  result: GamificationResult;
  onContinue: () => void;
}) {
  const displayProgress = roundProgressForDisplay(result.progressPercent);

  return (
    <div className="flex flex-col gap-6 px-5 py-8">
      <StepHeader title={config.title} subtitle={config.subtitle} />

      <div className="flex flex-col items-center gap-3">
        <div className="text-3xl font-bold" style={{ color: "var(--storefront-primary)" }} aria-live="polite">
          {displayProgress}%
        </div>

        {config.showProgressBar && (
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-black/10"
            role="progressbar"
            aria-valuenow={displayProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${result.progressPercent}%`, background: "var(--storefront-primary)" }}
            />
          </div>
        )}

        <p aria-live="polite" className="text-sm opacity-70">
          {result.status === "COMPLETED" ? config.finalMessage : STATUS_MESSAGE[result.status]}
        </p>

        {config.showCurrentValue && result.currentValue !== null && (
          <p className="text-sm opacity-70">Ahorras: {formatMoneyForDisplay(result.currentValue, currency)}</p>
        )}
        {config.showRemainingValue && result.remainingValue !== null && result.remainingValue > 0 && (
          <p className="text-sm opacity-70">Faltan: {formatMoneyForDisplay(result.remainingValue, currency)}</p>
        )}
        {result.milestone && <p className="text-sm font-medium">{result.milestone.label}</p>}
        {result.status === "COMPLETED" && result.reward.type !== "FIXED_DISCOUNT" && result.reward.type !== "PERCENT_DISCOUNT" && (
          <p className="text-sm font-medium">{result.reward.message}</p>
        )}
      </div>

      <PrimaryButton soft={isSoftButtonStyle(theme)} onClick={onContinue}>
        {config.ctaText}
      </PrimaryButton>
    </div>
  );
}
