// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createBuilderState } from "./builder-state";
import { PreviewPanel } from "./PreviewPanel";
import type { FunnelConfig } from "@/modules/funnels/config/schema";

const theme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM" as const,
  fontFamily: "SYSTEM" as const,
  buttonStyle: "SOLID" as const,
};

const config: FunnelConfig = {
  schemaVersion: 3,
  theme,
  settings: {},
  steps: [
    {
      id: "product",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "Comprar agora" },
    },
    {
      id: "success",
      type: "SUCCESS",
      enabled: true,
      order: 1,
      config: { title: "Pedido confirmado", showOrderNumber: true, showRewardProgress: false },
    },
  ],
};

const snapshot = { title: "Produto Teste", featuredImageUrl: null, unitPrice: 100, compareAtPrice: null };

describe("PreviewPanel", () => {
  it("renderiza o step selecionado usando o runtime do storefront (mesmo renderer)", () => {
    const state = { ...createBuilderState(config, 1), selected: { kind: "step" as const, stepId: "product" } };
    render(
      <PreviewPanel
        state={state}
        dispatch={() => {}}
        funnelMeta={{ id: "f1", name: "Funil", slug: "funil", publicId: "pub1", versionId: "v1" }}
        snapshot={snapshot}
        currency="COP"
        upsellProduct={null}
      />
    );
    // O CTA vem exatamente do config do PRODUCT step — prova que o preview
    // não é um mock separado, é o mesmo StepRenderer do storefront público.
    expect(screen.getByText("Comprar agora")).toBeInTheDocument();
  });

  it("acompanha a seleção de outra etapa no builder (forcedStepId)", () => {
    const state = { ...createBuilderState(config, 1), selected: { kind: "step" as const, stepId: "success" } };
    render(
      <PreviewPanel
        state={state}
        dispatch={() => {}}
        funnelMeta={{ id: "f1", name: "Funil", slug: "funil", publicId: "pub1", versionId: "v1" }}
        snapshot={snapshot}
        currency="COP"
        upsellProduct={null}
      />
    );
    expect(screen.getByText("Pedido confirmado")).toBeInTheDocument();
  });
});
