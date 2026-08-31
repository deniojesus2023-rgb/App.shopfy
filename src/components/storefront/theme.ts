import type { FunnelTheme } from "@/modules/funnels/config/theme";

const RADIUS_MAP: Record<FunnelTheme["borderRadius"], string> = {
  SMALL: "6px",
  MEDIUM: "12px",
  LARGE: "20px",
};

const FONT_MAP: Record<FunnelTheme["fontFamily"], string> = {
  SYSTEM:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  INTER: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

/**
 * Único ponto que traduz `FunnelConfig.theme` (já validado por Zod — cores
 * hex estritas, enums fechados) em CSS variables. Nunca gera classe
 * Tailwind dinamicamente a partir de config, e nunca injeta CSS/HTML
 * arbitrário — só estes valores, já tipados.
 */
export function themeToCssVariables(theme: FunnelTheme): React.CSSProperties {
  return {
    "--storefront-primary": theme.primaryColor,
    "--storefront-background": theme.backgroundColor,
    "--storefront-text": theme.textColor,
    "--storefront-muted": theme.mutedColor,
    "--storefront-radius": RADIUS_MAP[theme.borderRadius],
    "--storefront-font": FONT_MAP[theme.fontFamily],
  } as React.CSSProperties;
}

export function isSoftButtonStyle(theme: FunnelTheme): boolean {
  return theme.buttonStyle === "SOFT";
}
