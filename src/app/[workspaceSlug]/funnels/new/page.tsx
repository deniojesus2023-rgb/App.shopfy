import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { listProducts } from "@/modules/catalog/service";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import { CreateFunnelForm } from "./create-funnel-form";

export default async function NewFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ storeId?: string; productId?: string }>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:create");

  const stores = await prisma.shopifyStore.findMany({
    where: { workspaceId: ctx.workspace.id, status: "CONNECTED" },
    orderBy: { createdAt: "asc" },
  });

  const selectedStoreId = query.storeId && stores.some((s) => s.id === query.storeId) ? query.storeId : undefined;

  const products = selectedStoreId
    ? (
        await listProducts({
          workspaceId: ctx.workspace.id,
          shopifyStoreId: selectedStoreId,
          status: "ACTIVE",
          pageSize: 100,
        })
      ).items
    : [];

  const selectedProductId =
    query.productId && products.some((p) => p.id === query.productId) ? query.productId : undefined;

  const templates = selectedProductId
    ? await prisma.funnelTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Criar funil</h1>
        <p className="text-neutral-600">Selecione a loja, o produto e o template para começar.</p>
      </div>

      {stores.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhuma loja conectada. Conecte uma loja Shopify antes de criar um funil.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Loja Shopify</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="GET" className="flex items-center gap-3">
              <select
                name="storeId"
                defaultValue={selectedStoreId ?? ""}
                className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                <option value="" disabled>
                  Selecione uma loja
                </option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.displayName ?? store.shopDomain}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-sm underline-offset-2 hover:underline">
                Continuar
              </button>
            </form>
          </CardContent>
        </Card>
      )}

      {selectedStoreId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Produto</CardTitle>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nenhum produto ativo importado desta loja. Sincronize o catálogo primeiro.
              </p>
            ) : (
              <form method="GET" className="flex items-center gap-3">
                <input type="hidden" name="storeId" value={selectedStoreId} />
                <select
                  name="productId"
                  defaultValue={selectedProductId ?? ""}
                  className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  <option value="" disabled>
                    Selecione um produto
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-sm underline-offset-2 hover:underline">
                  Continuar
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {selectedStoreId && selectedProductId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Template e detalhes</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateFunnelForm
              workspaceSlug={workspaceSlug}
              shopifyStoreId={selectedStoreId}
              productId={selectedProductId}
              templates={templates}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
