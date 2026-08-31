"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SuccessStepConfig } from "@/modules/funnels/config/steps";

export function SuccessEditor({
  config,
  onChange,
}: {
  config: SuccessStepConfig;
  onChange: (config: SuccessStepConfig) => void;
}) {
  function update(patch: Partial<SuccessStepConfig>) {
    onChange({ ...config, ...patch });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="success-title">Título</Label>
        <Input id="success-title" value={config.title} maxLength={150} onChange={(e) => update({ title: e.target.value })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="success-subtitle">Subtítulo</Label>
        <Input
          id="success-subtitle"
          value={config.subtitle ?? ""}
          maxLength={300}
          onChange={(e) => update({ subtitle: e.target.value })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={config.showOrderNumber} onChange={(e) => update({ showOrderNumber: e.target.checked })} />
        Mostrar número do pedido (demo)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.showRewardProgress}
          onChange={(e) => update({ showRewardProgress: e.target.checked })}
        />
        Mostrar progresso da recompensa
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="success-cta">Texto do botão (opcional, só aparece se houver próxima etapa)</Label>
        <Input
          id="success-cta"
          value={config.ctaText ?? ""}
          maxLength={60}
          onChange={(e) => update({ ctaText: e.target.value })}
        />
      </div>
    </div>
  );
}
