// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
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

describe("CodFormStepView (validação visual)", () => {
  it("bloqueia o envio quando um campo obrigatório está vazio", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView config={config} theme={theme} onSubmitted={onSubmitted} />);

    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findAllByText(/Campo obrigatório/)).not.toHaveLength(0);
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("rejeita telefone em formato inválido", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView config={config} theme={theme} onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "abc");
    await user.click(screen.getByText("Confirmar pedido"));

    expect(await screen.findByText(/Número inválido/)).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("campo opcional vazio não bloqueia o envio", async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<CodFormStepView config={config} theme={theme} onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText(/Nombre completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Teléfono/), "+51 999 999 999");
    await user.click(screen.getByText("Confirmar pedido"));

    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it("só renderiza os campos habilitados no config, nada arbitrário", () => {
    render(<CodFormStepView config={config} theme={theme} onSubmitted={vi.fn()} />);
    expect(screen.queryByLabelText(/País/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ciudad/)).not.toBeInTheDocument();
  });
});
