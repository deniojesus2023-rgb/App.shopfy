import { describe, expect, it } from "vitest";

import { isSoftButtonStyle, themeToCssVariables } from "./theme";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

const theme: FunnelTheme = {
  primaryColor: "#FF0000",
  backgroundColor: "#FFFFFF",
  textColor: "#111111",
  mutedColor: "#999999",
  borderRadius: "LARGE",
  fontFamily: "INTER",
  buttonStyle: "SOFT",
};

describe("themeToCssVariables", () => {
  it("mapeia cores diretamente para CSS variables", () => {
    const vars = themeToCssVariables(theme) as Record<string, string>;
    expect(vars["--storefront-primary"]).toBe("#FF0000");
    expect(vars["--storefront-background"]).toBe("#FFFFFF");
    expect(vars["--storefront-text"]).toBe("#111111");
    expect(vars["--storefront-muted"]).toBe("#999999");
  });

  it("traduz borderRadius/fontFamily para valores CSS concretos, não repassa o enum cru", () => {
    const vars = themeToCssVariables(theme) as Record<string, string>;
    expect(vars["--storefront-radius"]).toBe("20px");
    expect(vars["--storefront-font"]).toContain("Inter");
  });

  it("nunca inclui um valor que não seja um dos campos conhecidos do tema", () => {
    const vars = themeToCssVariables(theme) as Record<string, string>;
    expect(Object.keys(vars).sort()).toEqual(
      [
        "--storefront-primary",
        "--storefront-background",
        "--storefront-text",
        "--storefront-muted",
        "--storefront-radius",
        "--storefront-font",
      ].sort()
    );
  });
});

describe("isSoftButtonStyle", () => {
  it("true só quando buttonStyle é SOFT", () => {
    expect(isSoftButtonStyle(theme)).toBe(true);
    expect(isSoftButtonStyle({ ...theme, buttonStyle: "SOLID" })).toBe(false);
  });
});
