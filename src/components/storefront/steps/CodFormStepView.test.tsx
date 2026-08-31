// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { OrderConfirmation } from "@/modules/funnels/runtime/state";
import { CodFormStepView } from "./CodFormStepView";

const theme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

const config = {
  fields: [
    { key: "NAME" as const, enabled: true, required: true },
    { key: "PHONE" as const, enabled: true, required: true },
    { key: "ADDRESS_REFERENCE" as const, enabled: true, required: false },
  ],
  submitButtonText: "Confirmar pedido",
};

const baseProps = {
  config,
  theme,
  funnelPublicId: "pub1",
  funnelVersionId: "cversion0000000000000001",
  checkoutAttemptId: "attempt-1",
  selectedOfferId: null,
  selectedPaymentMethod: "COD" as const,
};

const okOrder: OrderConfirmation = { publicOrderId: "pub-order", orderNumber: 1048, status: "PENDING", total: "89900.00", currency: "COP" };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: okOrder }) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CodFormStepView — validação de formulário", () => {
  it("bloqueia o envio quando um campo obrigatório está vazio", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} onSubmitted={onSubmitted} />);

    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findAllByText(/Campo obrigatório/)).not.toHaveLength(0);
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita telefone em formato inválido", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "abc");
    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByText(/Número inválido/)).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("só renderiza os campos habilitados no config, nada arbitrário", () => {
    render(<CodFormStepView {...baseProps} onSubmitted={vi.fn()} />);
    expect(screen.queryByLabelText(/País/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ciudad/)).not.toBeInTheDocument();
  });
});

describe("CodFormStepView — submit real (Fase 3)", () => {
  it("envia POST /api/storefront/orders e chama onSubmitted com o Order retornado", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "+51 999 999 999");
    await user.click(screen.getByText("Confirmar pedido"));

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(okOrder));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/storefront/orders");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      funnelPublicId: "pub1",
      funnelVersionId: "cversion0000000000000001",
      checkoutAttemptId: "attempt-1",
      selectedPaymentMethod: "COD",
    });
    // Nunca inventa preço/total no client — o servidor é a autoridade.
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("price");
  });

  it("mostra o erro do servidor sem stack trace quando a resposta é ok:false", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: false, error: "Revisa los datos ingresados." }) });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "+51 999 999 999");
    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa los datos ingresados.");
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("nunca chama a rede quando o método selecionado é ONLINE (não implementado ainda)", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} selectedPaymentMethod="ONLINE" onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "+51 999 999 999");
    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/pago en línea/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("no builder (isPreview) nunca chama a rede — simula localmente", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView {...baseProps} isPreview onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "+51 999 999 999");
    await user.click(screen.getByText("Confirmar pedido"));

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
