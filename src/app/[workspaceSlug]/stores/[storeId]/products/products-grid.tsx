import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import type { ProductListItem } from "@/modules/catalog/service";

const STATUS_LABEL: Record<ProductListItem["status"], string> = {
  ACTIVE: "Ativo",
  DRAFT: "Rascunho",
  ARCHIVED: "Arquivado",
};

const STATUS_CLASS: Record<ProductListItem["status"], string> = {
  ACTIVE: "bg-green-100 text-green-700",
  DRAFT: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-neutral-100 text-neutral-600",
};

export function ProductsGrid({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-neutral-500">Nenhum produto encontrado.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <Card key={product.id}>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100">
            {product.featuredImageUrl ? (
              <Image
                src={product.featuredImageUrl}
                alt={product.title}
                width={300}
                height={300}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xs text-neutral-400">Sem imagem</span>
            )}
          </div>
          <CardContent className="flex flex-col gap-2 pt-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[product.status]}`}
              >
                {STATUS_LABEL[product.status]}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-neutral-600">
              <span>{product.variantCount} variante(s)</span>
              {product.startingPrice && <span className="font-medium">a partir de R$ {product.startingPrice}</span>}
            </div>
            {product.totalInventory != null && (
              <span className="text-xs text-neutral-500">Estoque total: {product.totalInventory}</span>
            )}
            <span className="text-xs text-neutral-400">
              Atualizado em {(product.shopifyUpdatedAt ?? product.syncedAt).toLocaleDateString("pt-BR")}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
