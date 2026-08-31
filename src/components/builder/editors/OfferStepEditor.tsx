"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OfferStepConfig } from "@/modules/funnels/config/steps";
import { formatMoneyForDisplay } from "@/modules/shared/money";
import { resolveOfferPrice, savingsPercent } from "@/modules/funnels/pricing/resolve-offer-price";

function newOfferId() {
  return `offer-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Núcleo de precificação compartilhado (spec item 15): a mesma
 * `resolveOfferPrice` usada aqui é usada pelo storefront e pelo servidor —
 * o Builder só mostra o resultado, nunca decide sozinho o que será
 * cobrado (isso é sempre o `calculateOrderQuote` no servidor).
 */
export function OfferStepEditor({
  config,
  unitPrice,
  currency,
  onChange,
}: {
  config: OfferStepConfig;
  unitPrice: number;
  currency: string;
  onChange: (config: OfferStepConfig) => void;
}) {
  function updateOffer(index: number, patch: Partial<OfferStepConfig["offers"][number]>) {
    const offers = [...config.offers];
    offers[index] = { ...offers[index], ...patch };
    onChange({ ...config, offers });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= config.offers.length) return;
    const offers = [...config.offers];
    [offers[index], offers[target]] = [offers[target], offers[index]];
    onChange({ ...config, offers });
  }

  function format(value: number) {
    return formatMoneyForDisplay(value, currency);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <Label htmlFor="defaultOfferId">Oferta predeterminada</Label>
        <select
          id="defaultOfferId"
          value={config.defaultOfferId ?? ""}
          onChange={(e) => onChange({ ...config, defaultOfferId: e.target.value || undefined })}
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">Ninguna (usa el precio base del producto)</option>
          {config.offers.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.label || offer.id}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Define qué precio aparece en la etapa Producto antes de que el visitante llegue a esta oferta. No
          preselecciona nada aquí — el visitante siempre elige explícitamente.
        </p>
      </div>

      {config.offers.map((offer, index) => {
        const resolved = resolveOfferPrice(unitPrice, offer);
        const savings = savingsPercent(resolved);
        const isFixed = offer.pricing.type === "FIXED_TOTAL";
        const showsHigherWarning = resolved.discount < 0;

        return (
          <div key={offer.id} className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">Oferta {index + 1}</span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)}>
                  ▲
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === config.offers.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ▼
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={config.offers.length <= 1}
                  onClick={() => onChange({ ...config, offers: config.offers.filter((_, i) => i !== index) })}
                >
                  Remover
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`qty-${offer.id}`}>Cantidad</Label>
                <Input
                  id={`qty-${offer.id}`}
                  type="number"
                  min={1}
                  max={20}
                  value={offer.quantity}
                  onChange={(e) => updateOffer(index, { quantity: Math.max(1, Number(e.target.value)) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`label-${offer.id}`}>Rótulo</Label>
                <Input
                  id={`label-${offer.id}`}
                  value={offer.label}
                  maxLength={120}
                  onChange={(e) => updateOffer(index, { label: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`badge-${offer.id}`}>Badge (opcional)</Label>
              <Input
                id={`badge-${offer.id}`}
                value={offer.badge ?? ""}
                maxLength={40}
                onChange={(e) => updateOffer(index, { badge: e.target.value || undefined })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`pricing-type-${offer.id}`}>Tipo de precio</Label>
              <select
                id={`pricing-type-${offer.id}`}
                value={offer.pricing.type}
                onChange={(e) =>
                  updateOffer(index, {
                    pricing:
                      e.target.value === "FIXED_TOTAL"
                        ? { type: "FIXED_TOTAL", amount: resolved.referenceSubtotal }
                        : { type: "UNIT_MULTIPLIER" },
                  })
                }
                className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                <option value="UNIT_MULTIPLIER">Precio automático (unitario × cantidad)</option>
                <option value="FIXED_TOTAL">Precio fijo</option>
              </select>
            </div>

            {isFixed && offer.pricing.type === "FIXED_TOTAL" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`fixed-amount-${offer.id}`}>Precio total del paquete</Label>
                <Input
                  id={`fixed-amount-${offer.id}`}
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={offer.pricing.amount}
                  onChange={(e) =>
                    updateOffer(index, {
                      pricing: { type: "FIXED_TOTAL", amount: Math.max(0.01, Number(e.target.value)) },
                    })
                  }
                />
              </div>
            )}

            <div className="flex flex-col gap-1 rounded-md bg-neutral-50 p-2.5 text-sm">
              <div className="flex justify-between text-neutral-500">
                <span>Precio de referencia</span>
                <span>{format(resolved.referenceSubtotal)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Precio de oferta</span>
                <span>{format(resolved.total)}</span>
              </div>
              {resolved.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Ahorras</span>
                  <span>
                    {format(resolved.discount)}
                    {savings != null && ` (${savings.toFixed(1)}%)`}
                  </span>
                </div>
              )}
            </div>

            {showsHigherWarning && (
              <p className="text-xs text-amber-700">
                El precio de esta oferta es superior al precio de referencia.
              </p>
            )}
          </div>
        );
      })}

      {config.offers.length < 6 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...config,
              offers: [
                ...config.offers,
                { id: newOfferId(), quantity: 1, label: "", pricing: { type: "UNIT_MULTIPLIER" } },
              ],
            })
          }
        >
          + Adicionar oferta
        </Button>
      )}
    </div>
  );
}
