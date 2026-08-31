// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PaymentChoiceStepConfig } from "@/modules/funnels/config/steps";
import { PaymentChoiceEditor } from "./PaymentChoiceEditor";

function config(overrides: Partial<PaymentChoiceStepConfig> = {}): PaymentChoiceStepConfig {
  return {
    allowCod: true,
    allowOnlinePayment: true,
    codLabel: "Pago contra entrega",
    onlinePaymentLabel: "Pago en línea",
    ...overrides,
  };
}

describe("PaymentChoiceEditor", () => {
  it("mostra os campos de COD apenas quando allowCod está ativo", () => {
    render(<PaymentChoiceEditor config={config({ allowOnlinePayment: false })} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Rótulo")).toBeInTheDocument();
  });

  it("não mostra campos de COD quando allowCod é falso", () => {
    render(<PaymentChoiceEditor config={config({ allowCod: false })} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Descrição", { selector: "#codDescription" })).not.toBeInTheDocument();
  });

  it("desabilita o checkbox do único método ativo (não deixa zerar os dois)", () => {
    render(<PaymentChoiceEditor config={config({ allowOnlinePayment: false })} onChange={vi.fn()} />);
    const codCheckbox = screen.getByRole("checkbox", { name: "Pago contra entrega" });
    expect(codCheckbox).toBeDisabled();
  });

  it("permite desativar um método quando o outro continua ativo", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PaymentChoiceEditor config={config()} onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Pago contra entrega" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ allowCod: false }));
  });
});
