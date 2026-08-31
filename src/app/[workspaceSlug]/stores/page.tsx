import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";
import { listStoresForWorkspace } from "@/modules/shopify/stores/service";
import { ConnectStoreForm } from "./connect-store-form";
import { StoresList } from "./stores-list";

export default async function StoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { error, connected } = await searchParams;
  const ctx = await requireWorkspaceMember(workspaceSlug);

  const canManage = roleHasPermission(ctx.role, "shopify:manage_stores");
  const stores = await listStoresForWorkspace(ctx.workspace.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Lojas Shopify</h1>
        <p className="text-neutral-600">
          Conecte uma ou mais lojas Shopify a {ctx.workspace.name}.
        </p>
      </div>

      {connected === "1" && (
        <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Loja conectada com sucesso.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lojas conectadas</CardTitle>
        </CardHeader>
        <CardContent>
          <StoresList workspaceSlug={workspaceSlug} stores={stores} canManage={canManage} />
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Conectar nova loja</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectStoreForm workspaceSlug={workspaceSlug} errorCode={error} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
