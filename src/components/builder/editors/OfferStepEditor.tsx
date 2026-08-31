"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OfferStepConfig } from "@/modules/funnels/config/steps";
import { computeOfferPrice, formatPrice } from "@/modules/funnels/runtime/pricing";

function newOfferId() {
  return `offer-${Math.random().toString(36).slice(2, 8)}`;
}

export function OfferStepEditor({
  config,
  unitPrice,
  onChange,
}: {
  config: OfferStepConfig;
  unitPrice: number;
  onChange: (config: OfferStepConfig) => void;
}) {
  function updateOffer(index: number, patch: Partial<OfferStepConfig["offers"][number]>) {
    const offers = [...config.offers];
    offers[index] = { ...offers[index], ...patch };
    onChange({ offers });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= config.offers.length) return;
    const offers = [...config.offers];
    [offers[index], offers[target]] = [offers[target], offers[index]];
    onChange({ offers });
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        TODO(Pricing Engine): quando existir uma PricingRule por
        quantidade/oferta, o preço aqui deixa de ser unitPrice × quantity
        puro e passa a consultar essa engine. Até lá, o cálculo é sempre
        explícito e feito no servidor (modules/funnels/runtime/pricing.ts),
        nunca editável manualmente aqui — evita preço divergente do que o
        storefront realmente cobra.
      */}
      {config.offers.map((offer, index) => (
        <div key={offer.id} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
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
                onClick={() => onChange({ offers: config.offers.filter((_, i) => i !== index) })}
              >
                Remover
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`qty-${offer.id}`}>Quantidade</Label>
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
              <Label>Preço calculado</Label>
              <p className="flex h-9 items-center text-sm font-medium">
                {formatPrice(computeOfferPrice(unitPrice, offer.quantity))}
              </p>
            </div>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`badge-${offer.id}`}>Badge (opcional)</Label>
            <Input
              id={`badge-${offer.id}`}
              value={offer.badge ?? ""}
              maxLength={40}
              onChange={(e) => updateOffer(index, { badge: e.target.value || undefined })}
            />
          </div>
        </div>
      ))}

      {config.offers.length < 6 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({ offers: [...config.offers, { id: newOfferId(), quantity: 1, label: "" }] })
          }
        >
          + Adicionar oferta
        </Button>
      )}
    </div>
  );
}
