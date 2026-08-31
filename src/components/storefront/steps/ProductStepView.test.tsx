// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { OfferStepConfig, ProductStepConfig } from "@/modules/funnels/config/steps";
import { ProductStepView } from "./ProductStepView";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

const snapshot = { title: "Produto X", featuredImageUrl: null, unitPrice: 89900, compareAtPrice: 99900 };

function config(overrides: Partial<ProductStepConfig> = {}): ProductStepConfig {
  return {
    showRating: false,
    showBenefits: false,
    benefits: [],
    showCompareAtPrice: true,
    ctaText: "Comprar",
    ...overrides,
  };
}

describe("ProductStepView — preço", () => {
  it("sem etapa OFFER, mostra o preço do snapshot (comportamento pré-Fase 4A preservado)", () => {
    render(<ProductStepView config={config()} snapshot={snapshot} currency="COP" offerConfig={null} theme={theme} onContinue={vi.fn()} />);
    expect(screen.getByText("89900.00")).toBeInTheDocument();
    expect(screen.getByText("99900.00")).toBeInTheDocument();
  });

  it("com defaultOfferId de 1 unidade, mostra o preço resolvido dessa oferta", () => {
    const offerConfig: OfferStepConfig = {
      offers: [{ id: "one", quantity: 1, label: "1x", pricing: { type: "FIXED_TOTAL", amount: 79900 } }],
      defaultOfferId: "one",
    };
    render(
      <ProductStepView config={config()} snapshot={snapshot} currency="COP" offerConfig={offerConfig} theme={theme} onContinue={vi.fn()} />
    );
    expect(screen.getByText("79900.00")).toBeInTheDocument();
  });

  it("com defaultOfferId de bundle (>1 unidade), compara com a referência do PACOTE, não com o preço unitário", () => {
    const offerConfig: OfferStepConfig = {
      offers: [{ id: "two", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL", amount: 149900 } }],
      defaultOfferId: "two",
    };
    render(
      <ProductStepView config={config()} snapshot={snapshot} currency="COP" offerConfig={offerConfig} theme={theme} onContinue={vi.fn()} />
    );
    // Preço de oferta do bundle.
    expect(screen.getByText("149900.00")).toBeInTheDocument();
    // Referência do bundle (2 × 89.900), nunca o compareAtPrice do snapshot (99.900, de 1 unidade).
    expect(screen.getByText("179800.00")).toBeInTheDocument();
    expect(screen.queryByText("99900.00")).not.toBeInTheDocument();
  });

  it("sem defaultOfferId mesmo havendo etapa OFFER, mantém o preço do snapshot", () => {
    const offerConfig: OfferStepConfig = {
      offers: [{ id: "one", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" } }],
    };
    render(
      <ProductStepView config={config()} snapshot={snapshot} currency="COP" offerConfig={offerConfig} theme={theme} onContinue={vi.fn()} />
    );
    expect(screen.getByText("89900.00")).toBeInTheDocument();
  });
});
