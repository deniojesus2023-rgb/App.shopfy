// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GamificationResult } from "@/modules/funnels/gamification/evaluate";
import type { RewardStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { RewardStepView } from "./RewardStepView";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

function config(overrides: Partial<RewardStepConfig> = {}): RewardStepConfig {
  return {
    title: "Você tem um benefício",
    progressRule: { type: "STATIC_PROGRESS", baseProgress: 85 },
    reward: { type: "MESSAGE_ONLY", message: "Beneficio desbloqueado." },
    milestones: [],
    showProgressBar: true,
    showRemainingValue: false,
    showCurrentValue: false,
    ctaText: "Continuar",
    finalMessage: "¡Recompensa desbloqueada!",
    ...overrides,
  };
}

function result(overrides: Partial<GamificationResult> = {}): GamificationResult {
  return {
    progressPercent: 85,
    status: "IN_PROGRESS",
    unlocked: false,
    currentValue: null,
    targetValue: null,
    remainingValue: null,
    milestone: null,
    reward: { type: "MESSAGE_ONLY", message: "Beneficio desbloqueado." },
    ...overrides,
  };
}

describe("RewardStepView — mostra sempre o percentual real, nunca um texto digitado", () => {
  it("mostra o progressPercent exato (arredondado só para exibição)", () => {
    render(
      <RewardStepView config={config()} theme={theme} currency="COP" result={result({ progressPercent: 85.7 })} onContinue={vi.fn()} />
    );
    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("READY (100% sem pedido) nunca mostra a mensagem de desbloqueado", () => {
    render(
      <RewardStepView
        config={config()}
        theme={theme}
        currency="COP"
        result={result({ progressPercent: 100, status: "READY", unlocked: false })}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Todo listo para finalizar")).toBeInTheDocument();
    expect(screen.queryByText("Recompensa desbloqueada")).not.toBeInTheDocument();
    expect(screen.queryByText("¡Recompensa desbloqueada!")).not.toBeInTheDocument();
  });

  it("COMPLETED (pedido local real) mostra a mensagem final configurada", () => {
    render(
      <RewardStepView
        config={config()}
        theme={theme}
        currency="COP"
        result={result({ progressPercent: 100, status: "COMPLETED", unlocked: true })}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("¡Recompensa desbloqueada!")).toBeInTheDocument();
  });

  it("progressbar carrega os atributos ARIA corretos", () => {
    render(<RewardStepView config={config()} theme={theme} currency="COP" result={result({ progressPercent: 42 })} onContinue={vi.fn()} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("showProgressBar=false oculta a barra", () => {
    render(
      <RewardStepView config={config({ showProgressBar: false })} theme={theme} currency="COP" result={result()} onContinue={vi.fn()} />
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("mostra valor atual/restante só quando configurado e presente no resultado", () => {
    render(
      <RewardStepView
        config={config({ showCurrentValue: true, showRemainingValue: true })}
        theme={theme}
        currency="COP"
        result={result({ currentValue: 29900, remainingValue: 12100, targetValue: 42000 })}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText(/29900\.00/)).toBeInTheDocument();
    expect(screen.getByText(/12100\.00/)).toBeInTheDocument();
  });

  it("mostra o milestone alcançado quando presente", () => {
    render(
      <RewardStepView
        config={config()}
        theme={theme}
        currency="COP"
        result={result({ milestone: { progress: 85, label: "Beneficio activado" } })}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("Beneficio activado")).toBeInTheDocument();
  });

  it("CTA sempre chama onContinue — não existe mais um botão de 'desbloquear' separado", () => {
    const onContinue = vi.fn();
    render(<RewardStepView config={config()} theme={theme} currency="COP" result={result()} onContinue={onContinue} />);
    screen.getByText("Continuar").click();
    expect(onContinue).toHaveBeenCalled();
  });
});
