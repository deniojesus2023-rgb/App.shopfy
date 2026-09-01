// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OfferItem, RewardStepConfig } from "@/modules/funnels/config/steps";
import { RewardStepEditor } from "./RewardStepEditor";

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

const offers: OfferItem[] = [
  { id: "o1", quantity: 1, label: "1 unidade", pricing: { type: "UNIT_MULTIPLIER" } },
  { id: "o2", quantity: 2, label: "2 unidades", pricing: { type: "FIXED_TOTAL", amount: 149900 } },
];

describe("RewardStepEditor — tipo de progreso", () => {
  it("trocar para 'Según oferta seleccionada' reseta para OFFER_SELECTION_PROGRESS", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RewardStepEditor config={config()} offers={offers} unitPrice={89900} currency="COP" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Tipo de progreso"), "OFFER_SELECTION_PROGRESS");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ progressRule: { type: "OFFER_SELECTION_PROGRESS", baseProgress: 0, offerProgress: {} } })
    );
  });

  it("OFFER_SELECTION_PROGRESS mostra um controle por oferta real da etapa OFFER", () => {
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "OFFER_SELECTION_PROGRESS", baseProgress: 85, offerProgress: { o1: 90, o2: 100 } } })}
        offers={offers}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/1 unidade/)).toBeInTheDocument();
    expect(screen.getByLabelText(/2 unidades/)).toBeInTheDocument();
  });

  it("VALUE_THRESHOLD mostra o campo de meta de ahorro", () => {
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 42000, benefitType: "SAVINGS" } })}
        offers={offers}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Meta de ahorro/)).toBeInTheDocument();
  });

  it("sem etapa OFFER, avisa que VALUE_THRESHOLD/OFFER_SELECTION_PROGRESS a exigem", () => {
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 42000, benefitType: "SAVINGS" } })}
        offers={null}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/requiere una etapa OFFER/)).toBeInTheDocument();
  });
});

describe("RewardStepEditor — recompensa", () => {
  it("tipos de descuento (PRICING_REWARD) aparecem desabilitados — nunca selecionáveis", () => {
    render(<RewardStepEditor config={config()} offers={offers} unitPrice={89900} currency="COP" onChange={vi.fn()} />);
    const fixedOption = screen.getByText("Descuento fijo (Próximamente)") as HTMLOptionElement;
    expect(fixedOption.disabled).toBe(true);
  });
});

describe("RewardStepEditor — warnings não-bloqueantes", () => {
  it("avisa quando o progresso cai numa oferta 'maior' sem impedir a edição", () => {
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "OFFER_SELECTION_PROGRESS", baseProgress: 85, offerProgress: { o1: 100, o2: 50 } } })}
        offers={offers}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/menor que o da oferta anterior/)).toBeInTheDocument();
  });
});

describe("RewardStepEditor — preview usa o mesmo evaluateGamification do storefront", () => {
  it("preview 'Sin oferta' mostra o baseProgress", () => {
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "OFFER_SELECTION_PROGRESS", baseProgress: 85, offerProgress: { o1: 90, o2: 100 } } })}
        offers={offers}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("preview 'Pedido confirmado' sempre mostra COMPLETED/100%, mesmo com a regra em 0%", async () => {
    const user = userEvent.setup();
    render(
      <RewardStepEditor
        config={config({ progressRule: { type: "STATIC_PROGRESS", baseProgress: 0 } })}
        offers={offers}
        unitPrice={89900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    await user.selectOptions(screen.getByLabelText("Vista previa"), "ORDER_CONFIRMED");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });
});

describe("RewardStepEditor — milestones", () => {
  it("adicionar milestone chama onChange com um item novo", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RewardStepEditor config={config()} offers={offers} unitPrice={89900} currency="COP" onChange={onChange} />);

    await user.click(screen.getByText("+ Adicionar"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ milestones: [{ progress: 0, label: "" }] }));
  });
});
