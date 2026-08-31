// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SuccessStepConfig } from "@/modules/funnels/config/steps";
import { SuccessEditor } from "./SuccessEditor";

function config(overrides: Partial<SuccessStepConfig> = {}): SuccessStepConfig {
  return { title: "Sucesso", showOrderNumber: true, showRewardProgress: false, ...overrides };
}

describe("SuccessEditor", () => {
  it("edita título", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SuccessEditor config={config()} onChange={onChange} />);

    await user.type(screen.getByLabelText("Título"), "!");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Sucesso!" }));
  });

  it("alterna showRewardProgress", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SuccessEditor config={config()} onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: /Mostrar progresso da recompensa/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showRewardProgress: true }));
  });
});
