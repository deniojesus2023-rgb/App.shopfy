"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RewardStepConfig } from "@/modules/funnels/config/steps";

const DISPLAY_TYPE_LABELS: Record<RewardStepConfig["rewardDisplayType"], string> = {
  CURRENCY: "Moneda",
  PERCENTAGE: "Porcentaje",
  GENERIC: "Beneficio",
};

export function RewardStepEditor({
  config,
  onChange,
}: {
  config: RewardStepConfig;
  onChange: (config: RewardStepConfig) => void;
}) {
  function update(patch: Partial<RewardStepConfig>) {
    onChange({ ...config, ...patch });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-800">
        Esta configuración controla la presentación. Las reglas reales de recompensa se
        configurarán posteriormente.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-title">Título</Label>
        <Input id="reward-title" value={config.title} maxLength={150} onChange={(e) => update({ title: e.target.value })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-subtitle">Subtítulo</Label>
        <Input
          id="reward-subtitle"
          value={config.subtitle ?? ""}
          maxLength={300}
          onChange={(e) => update({ subtitle: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-type">Tipo de exibição</Label>
        <select
          id="reward-type"
          value={config.rewardDisplayType}
          onChange={(e) => update({ rewardDisplayType: e.target.value as RewardStepConfig["rewardDisplayType"] })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(DISPLAY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-value">Valor exibido</Label>
        <Input
          id="reward-value"
          value={config.displayValue}
          maxLength={50}
          onChange={(e) => update({ displayValue: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-progress">Progresso inicial ({config.initialProgress}%)</Label>
        <div className="flex items-center gap-3">
          <input
            id="reward-progress"
            type="range"
            min={0}
            max={100}
            value={config.initialProgress}
            onChange={(e) => update({ initialProgress: Number(e.target.value) })}
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={config.initialProgress}
            onChange={(e) => update({ initialProgress: Math.min(100, Math.max(0, Number(e.target.value))) })}
            className="w-20"
            aria-label="Progresso inicial (numérico)"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-cta">Texto do botão</Label>
        <Input id="reward-cta" value={config.ctaText} maxLength={60} onChange={(e) => update({ ctaText: e.target.value })} />
      </div>
    </div>
  );
}
