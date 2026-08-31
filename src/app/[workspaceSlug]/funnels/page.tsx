import Link from "next/link";

import { Button } from "@/components/ui/button";
import { listFunnels } from "@/modules/funnels/admin/service";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-neutral-100 text-neutral-600",
};

export default async function FunnelsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const ctx = await requireWorkspaceMember(workspaceSlug);
  const funnels = await listFunnels(ctx.workspace.id);
  const canCreate = roleHasPermission(ctx.role, "funnels:create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Funis</h1>
          <p className="text-neutral-600">Funis de vendas do workspace {ctx.workspace.name}.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href={`/${workspaceSlug}/funnels/new`}>+ Criar funil</Link>
          </Button>
        )}
      </div>

      {funnels.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum funil criado ainda.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Funil</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Produto principal</th>
                <th className="px-4 py-2 font-medium">Versão publicada</th>
                <th className="px-4 py-2 font-medium">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((funnel) => (
                <tr key={funnel.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${workspaceSlug}/funnels/${funnel.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {funnel.name}
                    </Link>
                    <div className="text-neutral-500">/{funnel.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[funnel.status]}`}
                    >
                      {STATUS_LABEL[funnel.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{funnel.products[0]?.product.title ?? "—"}</td>
                  <td className="px-4 py-3">
                    {funnel.publishedVersion ? `v${funnel.publishedVersion.versionNumber}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {funnel.updatedAt.toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
