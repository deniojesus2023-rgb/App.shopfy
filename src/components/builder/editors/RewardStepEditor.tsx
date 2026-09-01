"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateGamification, type GamificationContext } from "@/modules/funnels/gamification/evaluate";
import { computeGamificationWarnings } from "@/modules/funnels/gamification/warnings";
import type { GamificationProgressRule, GamificationReward } from "@/modules/funnels/config/gamification";
import { MAX_GAMIFICATION_MILESTONES } from "@/modules/funnels/config/gamification";
import type { OfferItem, RewardStepConfig } from "@/modules/funnels/config/steps";
import { formatMoneyForDisplay } from "@/modules/shared/money";

const RULE_TYPE_LABELS: Record<GamificationProgressRule["type"], string> = {
  STATIC_PROGRESS: "Progreso del flujo",
  OFFER_SELECTION_PROGRESS: "Según oferta seleccionada",
  VALUE_THRESHOLD: "Según ahorro real",
};

const REWARD_TYPE_LABELS: Record<"MESSAGE_ONLY" | "FREE_SHIPPING_DISPLAY", string> = {
  MESSAGE_ONLY: "Mensaje",
  FREE_SHIPPING_DISPLAY: "Envío gratis",
};

function defaultRuleFor(type: GamificationProgressRule["type"]): GamificationProgressRule {
  switch (type) {
    case "STATIC_PROGRESS":
      return { type: "STATIC_PROGRESS", baseProgress: 0 };
    case "OFFER_SELECTION_PROGRESS":
      return { type: "OFFER_SELECTION_PROGRESS", baseProgress: 0, offerProgress: {} };
    case "VALUE_THRESHOLD":
      return { type: "VALUE_THRESHOLD", source: "SELECTED_OFFER_SAVINGS", targetValue: 1, benefitType: "SAVINGS" };
  }
}

type PreviewScenario = "NONE" | "ORDER_CONFIRMED" | string;

export function RewardStepEditor({
  config,
  offers,
  unitPrice,
  currency,
  onChange,
}: {
  config: RewardStepConfig;
  /** Ofertas da etapa OFFER do mesmo funil (se houver) — alimenta os campos condicionais e o preview. */
  offers: OfferItem[] | null;
  unitPrice: number;
  currency: string;
  onChange: (config: RewardStepConfig) => void;
}) {
  const [previewScenario, setPreviewScenario] = useState<PreviewScenario>("NONE");

  function update(patch: Partial<RewardStepConfig>) {
    onChange({ ...config, ...patch });
  }

  function updateRule(patch: Partial<GamificationProgressRule>) {
    onChange({ ...config, progressRule: { ...config.progressRule, ...patch } as GamificationProgressRule });
  }

  function updateReward(reward: GamificationReward) {
    onChange({ ...config, reward });
  }

  const warnings = computeGamificationWarnings(config.progressRule, offers);

  const previewContext: GamificationContext = {
    selectedOfferId: previewScenario === "NONE" || previewScenario === "ORDER_CONFIRMED" ? null : previewScenario,
    orderConfirmed: previewScenario === "ORDER_CONFIRMED",
  };
  const preview = evaluateGamification({
    progressRule: config.progressRule,
    reward: config.reward,
    milestones: config.milestones,
    offers,
    unitPrice,
    context: previewContext,
  });

  const isPricingRewardType = config.reward.type === "FIXED_DISCOUNT" || config.reward.type === "PERCENT_DISCOUNT";

  return (
    <div className="flex flex-col gap-5">
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

      <div className="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <Label htmlFor="reward-rule-type">Tipo de progreso</Label>
        <select
          id="reward-rule-type"
          value={config.progressRule.type}
          onChange={(e) => update({ progressRule: defaultRuleFor(e.target.value as GamificationProgressRule["type"]) })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {config.progressRule.type === "STATIC_PROGRESS" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reward-base-progress">Progreso base ({config.progressRule.baseProgress}%)</Label>
            <input
              id="reward-base-progress"
              type="range"
              min={0}
              max={100}
              value={config.progressRule.baseProgress}
              onChange={(e) => updateRule({ baseProgress: Number(e.target.value) })}
            />
          </div>
        )}

        {config.progressRule.type === "OFFER_SELECTION_PROGRESS" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reward-base-progress-offer">Base (sin oferta seleccionada) ({config.progressRule.baseProgress}%)</Label>
              <input
                id="reward-base-progress-offer"
                type="range"
                min={0}
                max={100}
                value={config.progressRule.baseProgress}
                onChange={(e) => updateRule({ baseProgress: Number(e.target.value) })}
              />
            </div>
            {!offers && <p className="text-xs text-amber-700">Esta etapa requiere una etapa OFFER habilitada.</p>}
            {offers?.map((offer) => {
              const rule = config.progressRule as Extract<GamificationProgressRule, { type: "OFFER_SELECTION_PROGRESS" }>;
              const value = rule.offerProgress[offer.id] ?? 0;
              return (
                <div key={offer.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`reward-offer-progress-${offer.id}`}>
                    {offer.label || offer.id} ({value}%)
                  </Label>
                  <input
                    id={`reward-offer-progress-${offer.id}`}
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) =>
                      updateRule({ offerProgress: { ...rule.offerProgress, [offer.id]: Number(e.target.value) } })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {config.progressRule.type === "VALUE_THRESHOLD" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reward-target-value">Meta de ahorro ({currency})</Label>
            <Input
              id="reward-target-value"
              type="number"
              min={0.01}
              step={0.01}
              value={config.progressRule.targetValue}
              onChange={(e) => updateRule({ targetValue: Math.max(0.01, Number(e.target.value)) })}
            />
            {!offers && <p className="text-xs text-amber-700">Esta etapa requiere una etapa OFFER habilitada.</p>}
            <p className="text-xs text-neutral-500">
              El progreso se calcula a partir del ahorro real de la oferta seleccionada (precio de referencia menos
              precio de oferta) — nunca un valor escrito a mano.
            </p>
          </div>
        )}

        {warnings.map((w) => (
          <p key={w.path} className="text-xs text-amber-700">
            {w.message}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <Label htmlFor="reward-type">Tipo de recompensa</Label>
        <select
          id="reward-type"
          value={config.reward.type}
          onChange={(e) => {
            const type = e.target.value as "MESSAGE_ONLY" | "FREE_SHIPPING_DISPLAY";
            const message = "message" in config.reward ? config.reward.message : "";
            updateReward({ type, message });
          }}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {Object.entries(REWARD_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="FIXED_DISCOUNT" disabled>
            Descuento fijo (Próximamente)
          </option>
          <option value="PERCENT_DISCOUNT" disabled>
            Descuento porcentual (Próximamente)
          </option>
        </select>
        {isPricingRewardType && (
          <p className="text-xs text-red-700">
            Este tipo de recompensa todavía no está soportado — no se puede publicar mientras esté seleccionado.
          </p>
        )}
        {!isPricingRewardType && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reward-message">Mensaje al desbloquear</Label>
            <Input
              id="reward-message"
              value={"message" in config.reward ? config.reward.message : ""}
              maxLength={200}
              onChange={(e) =>
                updateReward({ type: config.reward.type as "MESSAGE_ONLY" | "FREE_SHIPPING_DISPLAY", message: e.target.value })
              }
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
        <div className="flex items-center justify-between">
          <Label>Milestones</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={config.milestones.length >= MAX_GAMIFICATION_MILESTONES}
            onClick={() => update({ milestones: [...config.milestones, { progress: 0, label: "" }] })}
          >
            + Adicionar
          </Button>
        </div>
        {config.milestones.map((milestone, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={milestone.progress}
              className="w-20"
              aria-label="Progreso del milestone"
              onChange={(e) => {
                const milestones = [...config.milestones];
                milestones[index] = { ...milestones[index], progress: Math.min(100, Math.max(0, Number(e.target.value))) };
                update({ milestones });
              }}
            />
            <Input
              value={milestone.label}
              maxLength={80}
              placeholder="Etiqueta"
              onChange={(e) => {
                const milestones = [...config.milestones];
                milestones[index] = { ...milestones[index], label: e.target.value };
                update({ milestones });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ milestones: config.milestones.filter((_, i) => i !== index) })}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.showProgressBar} onChange={(e) => update({ showProgressBar: e.target.checked })} />
          Mostrar barra de progreso
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.showCurrentValue}
            onChange={(e) => update({ showCurrentValue: e.target.checked })}
          />
          Mostrar valor actual (ahorro)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.showRemainingValue}
            onChange={(e) => update({ showRemainingValue: e.target.checked })}
          />
          Mostrar valor restante
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-cta">Texto del botón</Label>
        <Input id="reward-cta" value={config.ctaText} maxLength={60} onChange={(e) => update({ ctaText: e.target.value })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-final-message">Mensaje final (pedido confirmado)</Label>
        <Input
          id="reward-final-message"
          value={config.finalMessage}
          maxLength={200}
          onChange={(e) => update({ finalMessage: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <Label htmlFor="reward-preview-scenario">Vista previa</Label>
        <select
          id="reward-preview-scenario"
          value={previewScenario}
          onChange={(e) => setPreviewScenario(e.target.value)}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="NONE">Sin oferta</option>
          {offers?.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.label || offer.id}
            </option>
          ))}
          <option value="ORDER_CONFIRMED">Pedido confirmado</option>
        </select>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Progreso</span>
            <span className="font-medium">{Math.round(preview.progressPercent)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Estado</span>
            <span className="font-medium">{preview.status}</span>
          </div>
          {preview.currentValue !== null && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Ahorras</span>
              <span>{formatMoneyForDisplay(preview.currentValue, currency)}</span>
            </div>
          )}
          {preview.remainingValue !== null && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Faltan</span>
              <span>{formatMoneyForDisplay(preview.remainingValue, currency)}</span>
            </div>
          )}
          {preview.milestone && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Milestone</span>
              <span>{preview.milestone.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
