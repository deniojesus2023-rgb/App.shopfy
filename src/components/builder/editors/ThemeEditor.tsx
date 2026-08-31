"use client";

import { Label } from "@/components/ui/label";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import { ColorField } from "../components/ColorField";

const RADIUS_LABELS: Record<FunnelTheme["borderRadius"], string> = {
  SMALL: "Pequeño",
  MEDIUM: "Mediano",
  LARGE: "Grande",
};

const FONT_LABELS: Record<FunnelTheme["fontFamily"], string> = {
  SYSTEM: "System",
  INTER: "Inter",
};

const BUTTON_STYLE_LABELS: Record<FunnelTheme["buttonStyle"], string> = {
  SOLID: "Sólido",
  SOFT: "Suave",
};

export function ThemeEditor({
  theme,
  onChange,
}: {
  theme: FunnelTheme;
  onChange: (theme: FunnelTheme) => void;
}) {
  function update(patch: Partial<FunnelTheme>) {
    onChange({ ...theme, ...patch });
  }

  return (
    <div className="flex flex-col gap-5">
      <ColorField label="Cor primária" value={theme.primaryColor} onChange={(v) => update({ primaryColor: v })} />
      <ColorField label="Cor de fundo" value={theme.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
      <ColorField label="Cor do texto" value={theme.textColor} onChange={(v) => update({ textColor: v })} />
      <ColorField label="Cor neutra (muted)" value={theme.mutedColor} onChange={(v) => update({ mutedColor: v })} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="borderRadius">Arredondamento</Label>
        <select
          id="borderRadius"
          value={theme.borderRadius}
          onChange={(e) => update({ borderRadius: e.target.value as FunnelTheme["borderRadius"] })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(RADIUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fontFamily">Fonte</Label>
        <select
          id="fontFamily"
          value={theme.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value as FunnelTheme["fontFamily"] })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(FONT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buttonStyle">Estilo do botão</Label>
        <select
          id="buttonStyle"
          value={theme.buttonStyle}
          onChange={(e) => update({ buttonStyle: e.target.value as FunnelTheme["buttonStyle"] })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(BUTTON_STYLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
