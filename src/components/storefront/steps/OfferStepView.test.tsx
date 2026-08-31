// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { OfferStepConfig } from "@/modules/funnels/config/steps";
import { OfferStepView } from "./OfferStepView";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

const config: OfferStepConfig = {
  offers: [
    { id: "one", quantity: 1, label: "1 unidade", pricing: { type: "UNIT_MULTIPLIER" } },
    { id: "two", quantity: 2, label: "2 unidades", pricing: { type: "FIXED_TOTAL", amount: 149900 }, badge: "MÁS ELEGIDO" },
  ],
};

describe("OfferStepView", () => {
  it("mostra o preço resolvido de cada oferta (nunca calcula no client sem passar pelo core compartilhado)", () => {
    render(
      <OfferStepView config={config} theme={theme} unitPrice={89900} currency="COP" selectedOfferId={null} onSelect={vi.fn()} onContinue={vi.fn()} />
    );
    expect(screen.getByText("89900.00")).toBeInTheDocument();
    expect(screen.getByText("149900.00")).toBeInTheDocument();
  });

  it("mostra o preço 'de/por' só quando há desconto real derivado, nunca escrito à mão", () => {
    render(
      <OfferStepView config={config} theme={theme} unitPrice={89900} currency="COP" selectedOfferId={null} onSelect={vi.fn()} onContinue={vi.fn()} />
    );
    // Oferta "two": referência 179.800 riscada, oferta 149.900.
    expect(screen.getByText("179800.00")).toBeInTheDocument();
  });

  it("oferta sem desconto (UNIT_MULTIPLIER) não mostra preço riscado", () => {
    const singleOfferConfig: OfferStepConfig = {
      offers: [{ id: "one", quantity: 1, label: "1 unidade", pricing: { type: "UNIT_MULTIPLIER" } }],
    };
    render(
      <OfferStepView
        config={singleOfferConfig}
        theme={theme}
        unitPrice={89900}
        currency="COP"
        selectedOfferId={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    // Só um preço aparece — não há segundo valor riscado.
    expect(screen.getAllByText("89900.00")).toHaveLength(1);
  });

  it("mostra o badge configurado", () => {
    render(
      <OfferStepView config={config} theme={theme} unitPrice={89900} currency="COP" selectedOfferId={null} onSelect={vi.fn()} onContinue={vi.fn()} />
    );
    expect(screen.getByText("MÁS ELEGIDO")).toBeInTheDocument();
  });

  it("CONTINUAR fica desabilitado até uma oferta ser selecionada explicitamente", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <OfferStepView config={config} theme={theme} unitPrice={89900} currency="COP" selectedOfferId={null} onSelect={onSelect} onContinue={vi.fn()} />
    );

    expect(screen.getByText("CONTINUAR")).toBeDisabled();

    await user.click(screen.getByText("2 unidades"));
    expect(onSelect).toHaveBeenCalledWith("two", 2);
  });
});
