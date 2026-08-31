"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchStoreProductsAction } from "@/modules/funnels/admin/product-actions";
import type { ProductListItem } from "@/modules/catalog/service";

/**
 * Busca+paginação sempre via Server Action tenant-scoped
 * (`searchStoreProductsAction`) — nunca lista produtos direto no client.
 * Reutilizável: hoje só o UPSELL editor usa, mas o componente não sabe
 * nada sobre "upsell" — é só "escolher um Product desta loja".
 */
export function ProductSelector({
  workspaceSlug,
  shopifyStoreId,
  onSelect,
  onCancel,
}: {
  workspaceSlug: string;
  shopifyStoreId: string;
  onSelect: (product: ProductListItem) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextCursor?: string, append = false) {
    setError(null);
    startTransition(async () => {
      const result = await searchStoreProductsAction(workspaceSlug, {
        shopifyStoreId,
        search: search || undefined,
        cursor: nextCursor,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((prev) => (append ? [...prev, ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    });
  }

  useEffect(() => {
    const timeout = setTimeout(() => load(undefined, false), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar produto por título ou SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar produto"
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {items.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelect(product)}
            className="flex flex-col items-start gap-1 rounded-md border border-neutral-200 p-2 text-left text-xs hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-500"
          >
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-neutral-100">
              {product.featuredImageUrl ? (
                <Image
                  src={product.featuredImageUrl}
                  alt={product.title}
                  width={100}
                  height={100}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-neutral-400">Sem imagem</span>
              )}
            </div>
            <span className="line-clamp-2 font-medium">{product.title}</span>
            {product.startingPrice && <span className="text-neutral-500">a partir de {product.startingPrice}</span>}
          </button>
        ))}
      </div>

      {items.length === 0 && !isPending && <p className="text-sm text-neutral-500">Nenhum produto encontrado.</p>}

      {cursor && (
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => load(cursor, true)}>
          {isPending ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  );
}
