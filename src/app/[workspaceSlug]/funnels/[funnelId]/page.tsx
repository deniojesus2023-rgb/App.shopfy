import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseFunnelConfig } from "@/modules/funnels/config/parse";
import { getFunnelForWorkspace } from "@/modules/funnels/admin/service";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";
import { ArchiveButton, CreateDraftButton, PublishButton } from "./funnel-actions";
import { PreviewDraftButton } from "./preview-draft-button";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

export default async function FunnelDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; funnelId: string }>;
}) {
  const { workspaceSlug, funnelId } = await params;
  const ctx = await requireWorkspaceMember(workspaceSlug);
  const funnel = await getFunnelForWorkspace(ctx.workspace.id, funnelId);

  const canEdit = roleHasPermission(ctx.role, "funnels:edit");
  const canPublish = roleHasPermission(ctx.role, "funnels:publish");
  const canArchive = roleHasPermission(ctx.role, "funnels:archive");

  const draftVersion = funnel.versions.find((v) => v.status === "DRAFT");
  const primaryProduct = funnel.products.find((p) => p.role === "PRIMARY")?.product;

  const displayVersion = draftVersion ?? funnel.publishedVersion ?? funnel.versions[0];
  const parsedConfig = displayVersion
    ? parseFunnelConfig(displayVersion.configSchemaVersion, displayVersion.config)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{funnel.name}</h1>
          <p className="text-neutral-600">
            /{funnel.slug} · {funnel.shopifyStore.displayName ?? funnel.shopifyStore.shopDomain}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
            {STATUS_LABEL[funnel.status]}
          </span>
          {canArchive && funnel.status !== "ARCHIVED" && (
            <ArchiveButton workspaceSlug={workspaceSlug} funnelId={funnel.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-neutral-500">Produto principal</p>
            <p className="font-medium">{primaryProduct?.title ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-neutral-500">Versão publicada</p>
            <p className="font-medium">
              {funnel.publishedVersion ? `v${funnel.publishedVersion.versionNumber}` : "Nenhuma"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-neutral-500">Rascunho ativo</p>
            <p className="font-medium">{draftVersion ? `v${draftVersion.versionNumber}` : "Nenhum"}</p>
          </CardContent>
        </Card>
      </div>

      {parsedConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Etapas ({displayVersion!.status})</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm">
              {[...parsedConfig.steps]
                .sort((a, b) => a.order - b.order)
                .map((step) => (
                  <li key={step.id} className="flex items-center justify-between border-b border-neutral-100 py-1.5 last:border-0">
                    <span className={step.enabled ? "" : "text-neutral-400 line-through"}>
                      {step.order}. {step.type}
                    </span>
                    <span className="text-xs text-neutral-400">{step.id}</span>
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visualizar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {funnel.status === "PUBLISHED" && (
            <Button type="button" variant="outline" asChild>
              <Link href={`/f/${funnel.publicId}/${funnel.slug}`} target="_blank" rel="noopener noreferrer">
                Ver versão publicada
              </Link>
            </Button>
          )}
          {canEdit && draftVersion && (
            <PreviewDraftButton workspaceSlug={workspaceSlug} funnelId={funnel.id} />
          )}
          {funnel.status !== "PUBLISHED" && !draftVersion && (
            <p className="text-sm text-neutral-500">Publique o funil para gerar um link público.</p>
          )}
        </CardContent>
      </Card>

      {canEdit && funnel.status !== "ARCHIVED" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Configuração</CardTitle>
            {canPublish && draftVersion && (
              <PublishButton workspaceSlug={workspaceSlug} funnelId={funnel.id} />
            )}
          </CardHeader>
          <CardContent>
            {draftVersion ? (
              <Button type="button" asChild>
                <Link href={`/${workspaceSlug}/funnels/${funnel.id}/builder`}>Editar funil</Link>
              </Button>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-neutral-600">
                  Não há rascunho ativo. Crie um a partir da versão publicada para editar.
                </p>
                <CreateDraftButton workspaceSlug={workspaceSlug} funnelId={funnel.id} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
