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
      { id: "o1", quantity: 1, label: "Unidade" },
      { id: "o2", quantity: 2, label: "Dupla" },
    ],
    ...overrides,
  };
}

describe("OfferStepEditor", () => {
  it("mostra o preço calculado (unitPrice × quantity) somente leitura", () => {
    render(<OfferStepEditor config={config()} unitPrice={10} onChange={vi.fn()} />);
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("20.00")).toBeInTheDocument();
  });

  it("adiciona uma nova oferta", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} onChange={onChange} />);

    await user.click(screen.getByText("+ Adicionar oferta"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ offers: expect.arrayContaining([expect.objectContaining({ quantity: 1, label: "" })]) })
    );
    expect(onChange.mock.calls[0][0].offers).toHaveLength(3);
  });

  it("remove uma oferta quando há mais de uma", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} onChange={onChange} />);

    const removeButtons = screen.getAllByText("Remover");
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith({ offers: [expect.objectContaining({ id: "o2" })] });
  });

  it("desabilita remover quando resta apenas uma oferta", () => {
    render(<OfferStepEditor config={config({ offers: [{ id: "o1", quantity: 1, label: "Unidade" }] })} unitPrice={1000} onChange={vi.fn()} />);
    expect(screen.getByText("Remover")).toBeDisabled();
  });

  it("reordena ofertas via botão ▼", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} onChange={onChange} />);

    await user.click(screen.getAllByText("▼")[0]);

    expect(onChange).toHaveBeenCalledWith({
      offers: [expect.objectContaining({ id: "o2" }), expect.objectContaining({ id: "o1" })],
    });
  });

  it("não permite quantidade menor que 1", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OfferStepEditor config={config()} unitPrice={1000} onChange={onChange} />);

    const qtyInput = screen.getAllByLabelText("Quantidade")[0];
    await user.clear(qtyInput);
    await user.type(qtyInput, "0");

    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.offers[0].quantity).toBeGreaterThanOrEqual(1);
  });
});
