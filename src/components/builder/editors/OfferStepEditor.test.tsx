// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OfferStepConfig } from "@/modules/funnels/config/steps";
import { OfferStepEditor } from "./OfferStepEditor";

function config(overrides: Partial<OfferStepConfig> = {}): OfferStepConfig {
  return {
    offers: [
      { id: "o1", quantity: 1, label: "Unidade", pricing: { type: "UNIT_MULTIPLIER" } },
      { id: "o2", quantity: 2, label: "Dupla", pricing: { type: "UNIT_MULTIPLIER" } },
    ],
    ...overrides,
  };
}

describe("OfferStepEditor — automático (UNIT_MULTIPLIER)", () => {
  it("mostra o preço calculado (unitPrice × quantity) somente leitura", () => {
    render(<OfferStepEditor config={config()} unitPrice={10} currency="COP" onChange={vi.fn()} />);
    expect(screen.getAllByText("10.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20.00").length).toBeGreaterThan(0);
  });

  it("adiciona uma nova oferta já com pricing UNIT_MULTIPLIER", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    await user.click(screen.getByText("+ Adicionar oferta"));

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers).toHaveLength(3);
    expect(lastCall.offers[2]).toMatchObject({ quantity: 1, label: "", pricing: { type: "UNIT_MULTIPLIER" } });
  });

  it("remove uma oferta quando há mais de uma", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    const removeButtons = screen.getAllByText("Remover");
    await user.click(removeButtons[0]);

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers).toEqual([expect.objectContaining({ id: "o2" })]);
  });

  it("desabilita remover quando resta apenas uma oferta", () => {
    render(
      <OfferStepEditor
        config={config({ offers: [{ id: "o1", quantity: 1, label: "Unidade", pricing: { type: "UNIT_MULTIPLIER" } }] })}
        unitPrice={1000}
        currency="COP"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Remover")).toBeDisabled();
  });

  it("reordena ofertas via botão ▼", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    await user.click(screen.getAllByText("▼")[0]);

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers).toEqual([
      expect.objectContaining({ id: "o2" }),
      expect.objectContaining({ id: "o1" }),
    ]);
  });

  it("não permite quantidade menor que 1", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    const qtyInput = screen.getAllByLabelText("Cantidad")[0];
    await user.clear(qtyInput);
    await user.type(qtyInput, "0");

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers[0].quantity).toBeGreaterThanOrEqual(1);
  });
});

describe("OfferStepEditor — precio fijo (FIXED_TOTAL)", () => {
  function fixedConfig(amount: number, quantity = 2): OfferStepConfig {
    return {
      offers: [{ id: "o1", quantity, label: "2 unidades", pricing: { type: "FIXED_TOTAL", amount } }],
    };
  }

  it("mostra precio de referencia, precio de oferta y ahorras derivados (nunca escritos pelo usuário)", () => {
    render(<OfferStepEditor config={fixedConfig(149900)} unitPrice={89900} currency="COP" onChange={vi.fn()} />);

    expect(screen.getByText("Precio de referencia")).toBeInTheDocument();
    expect(screen.getByText("179800.00")).toBeInTheDocument();
    expect(screen.getByText("149900.00")).toBeInTheDocument();
    expect(screen.getByText("Ahorras")).toBeInTheDocument();
    expect(screen.getByText(/29900\.00/)).toBeInTheDocument();
  });

  it("preço fixo igual à referência não mostra 'Ahorras'", () => {
    render(<OfferStepEditor config={fixedConfig(179800)} unitPrice={89900} currency="COP" onChange={vi.fn()} />);
    expect(screen.queryByText("Ahorras")).not.toBeInTheDocument();
  });

  it("preço fixo maior que a referência mostra aviso, mas não bloqueia", () => {
    render(<OfferStepEditor config={fixedConfig(200000)} unitPrice={89900} currency="COP" onChange={vi.fn()} />);
    expect(screen.getByText(/superior al precio de referencia/)).toBeInTheDocument();
    // Nada desabilitado — é aviso, não bloqueio.
    expect(screen.getByLabelText("Precio total del paquete")).not.toBeDisabled();
  });

  it("alterna de automático para fijo preenchendo um amount inicial coerente", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    await user.selectOptions(screen.getAllByLabelText("Tipo de precio")[0], "FIXED_TOTAL");

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers[0].pricing).toEqual({ type: "FIXED_TOTAL", amount: 1000 });
  });
});

describe("OfferStepEditor — oferta predeterminada", () => {
  it("permite escolher defaultOfferId entre as ofertas existentes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} currency="COP" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Oferta predeterminada"), "o2");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ defaultOfferId: "o2" }));
  });
});
