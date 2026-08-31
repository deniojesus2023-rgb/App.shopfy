// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { ThemeEditor } from "./ThemeEditor";

const baseTheme: FunnelTheme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM",
  fontFamily: "SYSTEM",
  buttonStyle: "SOLID",
};

// ThemeEditor é um componente controlado puro — precisa de um wrapper com
// estado local para exercitar digitação/seleção como um usuário real faria
// (o pai é quem guarda o draftConfig no builder de verdade).
function ControlledThemeEditor({ onChange }: { onChange: (theme: FunnelTheme) => void }) {
  const [theme, setTheme] = useState(baseTheme);
  return (
    <ThemeEditor
      theme={theme}
      onChange={(next) => {
        setTheme(next);
        onChange(next);
      }}
    />
  );
}

describe("ThemeEditor", () => {
  it("mostra erro de formato quando o hex digitado é inválido", async () => {
    const user = userEvent.setup();
    render(<ControlledThemeEditor onChange={vi.fn()} />);

    const primaryHexInput = screen.getByLabelText("Cor primária");
    await user.clear(primaryHexInput);
    await user.type(primaryHexInput, "zzzzzz");

    expect(await screen.findAllByText("Use o formato #RRGGBB.")).not.toHaveLength(0);
  });

  it("propaga a mudança de cor válida", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ControlledThemeEditor onChange={onChange} />);

    const primaryHexInput = screen.getByLabelText("Cor primária");
    await user.clear(primaryHexInput);
    await user.type(primaryHexInput, "#FF0000");

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ primaryColor: "#FF0000" }));
  });

  it("altera arredondamento via select", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ControlledThemeEditor onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Arredondamento"), "LARGE");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ borderRadius: "LARGE" }));
  });
});
