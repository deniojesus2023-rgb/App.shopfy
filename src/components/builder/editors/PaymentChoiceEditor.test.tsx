// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PaymentChoiceStepConfig } from "@/modules/funnels/config/steps";
import { PaymentChoiceEditor } from "./PaymentChoiceEditor";

function config(overrides: Partial<PaymentChoiceStepConfig> = {}): PaymentChoiceStepConfig {
  return {
    paymentMethods: [
      { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "Pago contra entrega", pricing: { type: "NONE" } },
      { id: "online", method: "ONLINE", provider: "SHOPIFY_CHECKOUT", enabled: true, label: "Pago en línea", pricing: { type: "NONE" } },
    ],
    ...overrides,
  };
}

describe("PaymentChoiceEditor — COD", () => {
  it("mostra os campos de COD quando o método existe", () => {
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={vi.fn()} />);
    expect(screen.getAllByLabelText("Rótulo")[0]).toBeInTheDocument();
  });

  it("desabilita o checkbox do único método ativo (não deixa zerar todos)", () => {
    render(
      <PaymentChoiceEditor
        config={config({
          paymentMethods: [
            { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "COD", pricing: { type: "NONE" } },
          ],
        })}
        sampleOfferTotal={100}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    const codCheckbox = screen.getByRole("checkbox", { name: "Activar pago contra entrega" });
    expect(codCheckbox).toBeDisabled();
  });

  it("permite desativar um método quando o outro continua ativo", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Activar pago contra entrega" }));

    const [updated] = onChange.mock.calls.at(-1)!;
    const cod = (updated as PaymentChoiceStepConfig).paymentMethods.find((m) => m.method === "COD");
    expect(cod?.enabled).toBe(false);
  });

  it("COD sempre usa provider INTERNAL_COD — nenhum seletor de provider é mostrado", () => {
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={vi.fn()} />);
    expect(screen.getByText(/Proveedor: Pago contra entrega interno/)).toBeInTheDocument();
  });
});

describe("PaymentChoiceEditor — ONLINE", () => {
  it("mostra seletor de proveedor (Shopify Checkout / Yampi) para ONLINE", () => {
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={vi.fn()} />);
    const select = screen.getByLabelText("Proveedor");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Shopify Checkout")).toBeInTheDocument();
    expect(screen.getByText("Yampi")).toBeInTheDocument();
  });

  it("provider não-ready mostra aviso 'No conectado'", () => {
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={vi.fn()} />);
    expect(screen.getByText(/No conectado/)).toBeInTheDocument();
  });

  it("trocar o tipo de precio pra FIXED_DISCOUNT mostra o campo de valor", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={onChange} />);

    const pricingSelects = screen.getAllByLabelText(/Beneficio por pagar ahora|Precio$/);
    await user.selectOptions(pricingSelects[pricingSelects.length - 1], "FIXED_DISCOUNT");

    const [updated] = onChange.mock.calls.at(-1)!;
    const online = (updated as PaymentChoiceStepConfig).paymentMethods.find((m) => m.method === "ONLINE");
    expect(online?.pricing).toEqual({ type: "FIXED_DISCOUNT", amount: 0 });
  });
});

describe("PaymentChoiceEditor — preview de preço", () => {
  it("mostra preço/desconto derivados de resolvePaymentMethodPrice, nunca digitados", () => {
    render(
      <PaymentChoiceEditor
        config={config({
          paymentMethods: [
            { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "COD", pricing: { type: "NONE" } },
            {
              id: "online",
              method: "ONLINE",
              provider: "SHOPIFY_CHECKOUT",
              enabled: true,
              label: "Online",
              pricing: { type: "FIXED_DISCOUNT", amount: 5000 },
            },
          ],
        })}
        sampleOfferTotal={149900}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("144900.00")).toBeInTheDocument();
    expect(screen.getByText("5000.00")).toBeInTheDocument();
  });
});

describe("PaymentChoiceEditor — warnings não-bloqueantes", () => {
  it("mostra aviso de provider não conectado sem impedir a edição", () => {
    render(<PaymentChoiceEditor config={config()} sampleOfferTotal={100} currency="COP" onChange={vi.fn()} />);
    expect(screen.getByText(/usa o provider SHOPIFY_CHECKOUT/)).toBeInTheDocument();
  });
});
