// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CodFormStepConfig } from "@/modules/funnels/config/steps";
import { CodFormEditor } from "./CodFormEditor";

function config(overrides: Partial<CodFormStepConfig> = {}): CodFormStepConfig {
  return {
    fields: [
      { key: "NAME", enabled: true, required: true },
      { key: "PHONE", enabled: true, required: false },
    ],
    submitButtonText: "Enviar",
    ...overrides,
  };
}

describe("CodFormEditor", () => {
  it("desmarcar 'Obrigatório' fica indisponível quando o campo está desabilitado (required implica enabled)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CodFormEditor config={config()} onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Nome completo" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([expect.objectContaining({ key: "NAME", enabled: false, required: false })]),
      })
    );
  });

  it("quick-add só lista campos totalmente ausentes do array (não os desabilitados)", () => {
    render(
      <CodFormEditor
        config={config({ fields: [{ key: "NAME", enabled: false, required: false }] })}
        onChange={vi.fn()}
      />
    );
    // NAME está desabilitado mas presente no array — não deve reaparecer no quick-add.
    expect(screen.queryByText("+ Nome completo")).not.toBeInTheDocument();
    // PHONE está totalmente ausente — deve aparecer no quick-add.
    expect(screen.getByText("+ Telefone")).toBeInTheDocument();
  });

  it("adiciona um campo ausente via quick-add", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CodFormEditor config={config({ fields: [{ key: "NAME", enabled: true, required: false }] })} onChange={onChange} />);

    await user.click(screen.getByText("+ Telefone"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([expect.objectContaining({ key: "PHONE", enabled: true })]),
      })
    );
  });

  it("reordena campos via ▲/▼", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CodFormEditor config={config()} onChange={onChange} />);

    await user.click(screen.getByLabelText("Mover Telefone para cima"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ key: "PHONE" }), expect.objectContaining({ key: "NAME" })],
      })
    );
  });
});
