// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { NO_ONLINE_CHECKOUT_READINESS } from "@/modules/funnels/config/checkout-provider";
import type { PaymentChoiceStepConfig } from "@/modules/funnels/config/steps";
import { PaymentChoiceStepView } from "./PaymentChoiceStepView";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

const config: PaymentChoiceStepConfig = {
  paymentMethods: [
    { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "Pagar al recibir", pricing: { type: "NONE" } },
    {
      id: "online",
      method: "ONLINE",
      provider: "SHOPIFY_CHECKOUT",
      enabled: true,
      label: "Pagar ahora",
      pricing: { type: "FIXED_DISCOUNT", amount: 5000 },
    },
  ],
  recommendedMethodId: "cod",
};

describe("PaymentChoiceStepView — público (isPreview=false)", () => {
  it("mostra só métodos ready (INTERNAL_COD) — nunca um provider não conectado", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("Pagar al recibir")).toBeInTheDocument();
    expect(screen.queryByText("Pagar ahora")).not.toBeInTheDocument();
  });

  it("mostra o preço REAL de cada método (resolvePaymentMethodPrice), nunca texto digitado", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("149900.00")).toBeInTheDocument();
  });

  it("CONTINUAR fica desabilitado até uma seleção explícita", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview={false}
        onSelect={onSelect}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("CONTINUAR")).toBeDisabled();
    await user.click(screen.getByText("Pagar al recibir"));
    expect(onSelect).toHaveBeenCalledWith("cod");
  });

  it("mostra o badge Recomendado no método marcado como recommendedMethodId", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
  });
});

describe("PaymentChoiceStepView — preview do Builder (isPreview=true)", () => {
  it("mostra TODOS os métodos habilitados, mesmo com provider não conectado", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("Pagar al recibir")).toBeInTheDocument();
    expect(screen.getByText("Pagar ahora")).toBeInTheDocument();
  });

  it("mostra o badge 'No conectado' no método não-ready, e o input fica desabilitado", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("No conectado")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pagar ahora/ })).toBeDisabled();
  });

  it("mostra o preço com desconto do método ONLINE calculado (144900.00)", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("144900.00")).toBeInTheDocument();
    expect(screen.getByText(/Ahorras 5000\.00 adicionales/)).toBeInTheDocument();
  });
});

describe("PaymentChoiceStepView — métodos desabilitados nunca aparecem", () => {
  it("método enabled=false não aparece nem no preview", () => {
    const configOnlyCod: PaymentChoiceStepConfig = {
      paymentMethods: [
        { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "Pagar al recibir", pricing: { type: "NONE" } },
        { id: "online", method: "ONLINE", provider: "SHOPIFY_CHECKOUT", enabled: false, label: "Pagar ahora", pricing: { type: "NONE" } },
      ],
    };
    render(
      <PaymentChoiceStepView
        config={configOnlyCod}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.queryByText("Pagar ahora")).not.toBeInTheDocument();
  });
});

describe("PaymentChoiceStepView — readiness vinda do servidor (Fase 4D)", () => {
  const ready = { onlineCheckoutEnabled: true, storeConnected: true };

  it("com a flag ligada E loja conectada, ONLINE aparece no público", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={ready}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.getByText("Pagar ahora")).toBeInTheDocument();
    expect(screen.queryByText("No conectado")).not.toBeInTheDocument();
  });

  it("flag ligada mas loja desconectada mantém ONLINE fora do público (as duas condições são exigidas)", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected={null}
        readiness={{ onlineCheckoutEnabled: true, storeConnected: false }}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    expect(screen.queryByText("Pagar ahora")).not.toBeInTheDocument();
  });

  it("com ONLINE selecionado, o CTA vira 'PAGAR POR EL SITIO' e chama onOnlineCheckout (nunca avança etapa)", async () => {
    const onOnlineCheckout = vi.fn().mockResolvedValue(undefined);
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected="online"
        readiness={ready}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={onContinue}
        onOnlineCheckout={onOnlineCheckout}
      />
    );

    await user.click(screen.getByText("PAGAR POR EL SITIO"));

    expect(onOnlineCheckout).toHaveBeenCalledWith("online");
    // ONLINE nunca segue para o COD_FORM interno.
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("com COD selecionado, o CTA continua avançando pelo fluxo interno", async () => {
    const onOnlineCheckout = vi.fn();
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected="cod"
        readiness={ready}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={onContinue}
        onOnlineCheckout={onOnlineCheckout}
      />
    );

    await user.click(screen.getByText("CONTINUAR"));

    expect(onContinue).toHaveBeenCalled();
    expect(onOnlineCheckout).not.toHaveBeenCalled();
  });

  it("nunca promete total final: avisa que frete/impostos são calculados no checkout", () => {
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected="online"
        readiness={ready}
        isPreview={false}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
        onOnlineCheckout={vi.fn()}
      />
    );
    expect(screen.getByText(/El envío y los impuestos se calculan en el checkout/)).toBeInTheDocument();
  });

  it("preview do Builder nunca dispara checkout real (onOnlineCheckout ausente)", async () => {
    const user = userEvent.setup();
    render(
      <PaymentChoiceStepView
        config={config}
        theme={theme}
        offerTotal={149900}
        currency="COP"
        selected="online"
        readiness={NO_ONLINE_CHECKOUT_READINESS}
        isPreview
        onSelect={vi.fn()}
        onContinue={vi.fn()}
        onOnlineCheckout={null}
      />
    );

    await user.click(screen.getByText("PAGAR POR EL SITIO"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vista previa/);
  });
});
