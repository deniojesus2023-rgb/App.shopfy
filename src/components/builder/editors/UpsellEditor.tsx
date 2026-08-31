"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setUpsellProductAction } from "@/modules/funnels/admin/product-actions";
import type { UpsellStepConfig } from "@/modules/funnels/config/steps";
import type { ProductListItem } from "@/modules/catalog/service";
import { ProductSelector } from "../components/ProductSelector";

export interface UpsellProductRef {
  id: string;
  title: string;
  featuredImageUrl: string | null;
}

export function UpsellEditor({
  config,
  onChange,
  workspaceSlug,
  funnelId,
  shopifyStoreId,
  upsellProduct,
  onUpsellProductChange,
}: {
  config: UpsellStepConfig;
  onChange: (config: UpsellStepConfig) => void;
  workspaceSlug: string;
  funnelId: string;
  shopifyStoreId: string;
  upsellProduct: UpsellProductRef | null;
  onUpsellProductChange: (product: UpsellProductRef) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(product: ProductListItem) {
    setError(null);
    startTransition(async () => {
      const result = await setUpsellProductAction(workspaceSlug, { funnelId, productId: product.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onUpsellProductChange({ id: product.id, title: product.title, featuredImageUrl: product.featuredImageUrl });
      setSelecting(false);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Produto de upsell</Label>
        {upsellProduct ? (
          <div className="flex items-center justify-between rounded-md border border-neutral-200 p-2 text-sm">
            <span className="font-medium">{upsellProduct.title}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelecting(true)}>
              Trocar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">No hay un producto de upsell configurado.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelecting(true)} disabled={isPending}>
              Seleccionar producto
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {selecting && (
          <ProductSelector
            workspaceSlug={workspaceSlug}
            shopifyStoreId={shopifyStoreId}
            onSelect={handleSelect}
            onCancel={() => setSelecting(false)}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-headline">Título</Label>
        <Input
          id="upsell-headline"
          value={config.headline}
          maxLength={200}
          onChange={(e) => onChange({ ...config, headline: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-subheadline">Subtítulo</Label>
        <Input
          id="upsell-subheadline"
          value={config.subheadline ?? ""}
          maxLength={300}
          onChange={(e) => onChange({ ...config, subheadline: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-cta">Texto do botão (aceitar)</Label>
        <Input
          id="upsell-cta"
          value={config.ctaText}
          maxLength={60}
          onChange={(e) => onChange({ ...config, ctaText: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-decline">Texto do botão (recusar)</Label>
        <Input
          id="upsell-decline"
          value={config.declineText}
          maxLength={60}
          onChange={(e) => onChange({ ...config, declineText: e.target.value })}
        />
      </div>
    </div>
  );
}
