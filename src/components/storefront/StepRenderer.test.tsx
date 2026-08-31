// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FunnelStep } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { ResolvedProductSnapshot } from "@/modules/funnels/runtime/resolve";
import { createInitialRuntimeState } from "@/modules/funnels/runtime/state";
import { StepRenderer, type StepRendererCallbacks } from "./StepRenderer";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

const snapshot: ResolvedProductSnapshot = {
  title: "Produto Teste",
  featuredImageUrl: null,
  unitPrice: 19.9,
  compareAtPrice: 29.9,
};

const noopCallbacks: StepRendererCallbacks = {
  onContinue: vi.fn(),
  onSelectOffer: vi.fn(),
  onSelectPaymentMethod: vi.fn(),
  onUnlockReward: vi.fn(),
  onCodSubmitted: vi.fn(),
  onAcceptUpsell: vi.fn(),
  onDeclineUpsell: vi.fn(),
};

const baseState = createInitialRuntimeState({
  sessionId: "s",
  funnelId: "f",
  funnelVersionId: "v",
  steps: [],
  initialRewardProgress: 40,
  checkoutAttemptId: "attempt_1",
});

function renderStep(step: FunnelStep) {
  return render(
    <StepRenderer
      step={step}
      state={baseState}
      theme={theme}
      snapshot={snapshot}
      currency="COP"
      offerConfig={null}
      upsellProduct={null}
      hasNextStep={false}
      callbacks={noopCallbacks}
      funnelPublicId="pub1"
      isPreview={false}
    />
  );
}

describe("StepRenderer — despacha os 7 tipos de etapa", () => {
  it("PRODUCT renderiza ProductStepView (CTA e preço)", () => {
    renderStep({
      id: "s",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: true, ctaText: "Comprar agora" },
    });
    expect(screen.getByText("Comprar agora")).toBeInTheDocument();
  });

  it("REWARD renderiza RewardStepView (título + CTA de desbloqueio)", () => {
    renderStep({
      id: "s",
      type: "REWARD",
      enabled: true,
      order: 0,
      config: {
        title: "Você ganhou um benefício",
        rewardDisplayType: "GENERIC",
        displayValue: "10%",
        initialProgress: 40,
        ctaText: "Desbloquear",
      },
    });
    expect(screen.getByText("Você ganhou um benefício")).toBeInTheDocument();
    expect(screen.getByText("Desbloquear")).toBeInTheDocument();
  });

  it("OFFER renderiza um card por oferta", () => {
    renderStep({
      id: "s",
      type: "OFFER",
      enabled: true,
      order: 0,
      config: {
        offers: [
          { id: "o1", quantity: 1, label: "1 unidade", pricing: { type: "UNIT_MULTIPLIER" } },
          { id: "o2", quantity: 2, label: "2 unidades", pricing: { type: "UNIT_MULTIPLIER" } },
        ],
      },
    });
    expect(screen.getByText("1 unidade")).toBeInTheDocument();
    expect(screen.getByText("2 unidades")).toBeInTheDocument();
  });

  it("PAYMENT_CHOICE renderiza os métodos habilitados", () => {
    renderStep({
      id: "s",
      type: "PAYMENT_CHOICE",
      enabled: true,
      order: 0,
      config: {
        allowCod: true,
        allowOnlinePayment: false,
        codLabel: "Pagar na entrega",
        onlinePaymentLabel: "Pagar agora",
      },
    });
    expect(screen.getByText("Pagar na entrega")).toBeInTheDocument();
    expect(screen.queryByText("Pagar agora")).not.toBeInTheDocument();
  });

  it("COD_FORM renderiza os campos habilitados", () => {
    renderStep({
      id: "s",
      type: "COD_FORM",
      enabled: true,
      order: 0,
      config: {
        fields: [{ key: "NAME", enabled: true, required: true }],
        submitButtonText: "Confirmar pedido",
      },
    });
    expect(screen.getByLabelText(/Nombre completo/)).toBeInTheDocument();
    expect(screen.getByText("Confirmar pedido")).toBeInTheDocument();
  });

  it("SUCCESS sem pedido local ainda não afirma que o pedido foi confirmado", () => {
    renderStep({
      id: "s",
      type: "SUCCESS",
      enabled: true,
      order: 0,
      config: { title: "Pedido confirmado!", showOrderNumber: true, showRewardProgress: false },
    });
    expect(screen.getByText("Pedido confirmado!")).toBeInTheDocument();
    // Sem state.lastOrder (nenhum Order local criado ainda), nunca afirma
    // "¡Pedido confirmado!" nem mostra número de pedido inventado.
    expect(screen.queryByText("¡Pedido confirmado!")).not.toBeInTheDocument();
    expect(screen.queryByText(/N\.º de pedido/)).not.toBeInTheDocument();
  });

  it("UPSELL renderiza os dois botões de decisão", () => {
    renderStep({
      id: "s",
      type: "UPSELL",
      enabled: true,
      order: 0,
      config: { headline: "Leve mais um", productRole: "UPSELL", ctaText: "Agregar", declineText: "No, gracias" },
    });
    expect(screen.getByText("Agregar")).toBeInTheDocument();
    expect(screen.getByText("No, gracias")).toBeInTheDocument();
  });
});
