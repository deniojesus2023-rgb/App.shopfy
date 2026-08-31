"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProductStepConfig } from "@/modules/funnels/config/steps";

const LIMITS = { headline: 200, subheadline: 300, benefit: 150, ctaText: 60 };

export function ProductStepEditor({
  config,
  onChange,
}: {
  config: ProductStepConfig;
  onChange: (config: ProductStepConfig) => void;
}) {
  function update(patch: Partial<ProductStepConfig>) {
    onChange({ ...config, ...patch });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="headline">Título</Label>
        <Input
          id="headline"
          value={config.headline ?? ""}
          maxLength={LIMITS.headline}
          onChange={(e) => update({ headline: e.target.value })}
        />
        <span className="text-xs text-neutral-400">
          {(config.headline ?? "").length}/{LIMITS.headline}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subheadline">Subtítulo</Label>
        <Input
          id="subheadline"
          value={config.subheadline ?? ""}
          maxLength={LIMITS.subheadline}
          onChange={(e) => update({ subheadline: e.target.value })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.showRating}
          onChange={(e) => update({ showRating: e.target.checked })}
        />
        Mostrar avaliação
      </label>

      {config.showRating && (
        <div className="grid grid-cols-2 gap-3 pl-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ratingValue">Nota (0–5)</Label>
            <Input
              id="ratingValue"
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={config.ratingValue ?? ""}
              onChange={(e) => update({ ratingValue: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ratingCount">Nº de avaliações</Label>
            <Input
              id="ratingCount"
              type="number"
              min={0}
              value={config.ratingCount ?? ""}
              onChange={(e) => update({ ratingCount: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.showBenefits}
          onChange={(e) => update({ showBenefits: e.target.checked })}
        />
        Mostrar benefícios
      </label>

      {config.showBenefits && (
        <div className="flex flex-col gap-2 pl-6">
          {config.benefits.map((benefit, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={benefit}
                maxLength={LIMITS.benefit}
                aria-label={`Benefício ${index + 1}`}
                onChange={(e) => {
                  const benefits = [...config.benefits];
                  benefits[index] = e.target.value;
                  update({ benefits });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update({ benefits: config.benefits.filter((_, i) => i !== index) })}
              >
                Remover
              </Button>
            </div>
          ))}
          {config.benefits.length < 10 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update({ benefits: [...config.benefits, ""] })}
            >
              + Adicionar benefício
            </Button>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.showCompareAtPrice}
          onChange={(e) => update({ showCompareAtPrice: e.target.checked })}
        />
        Mostrar preço &quot;de/por&quot; (compare-at)
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ctaText">Texto do botão</Label>
        <Input
          id="ctaText"
          value={config.ctaText}
          maxLength={LIMITS.ctaText}
          onChange={(e) => update({ ctaText: e.target.value })}
        />
      </div>
    </div>
  );
}
