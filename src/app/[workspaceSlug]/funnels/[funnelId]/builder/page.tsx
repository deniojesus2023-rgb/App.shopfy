import { redirect } from "next/navigation";

import { FunnelBuilder } from "@/components/builder/FunnelBuilder";
import { getFunnelForWorkspace } from "@/modules/funnels/admin/service";
import { resolveFunnelVersionForPreview } from "@/modules/funnels/runtime/resolve";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";

export default async function FunnelBuilderPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; funnelId: string }>;
}) {
  const { workspaceSlug, funnelId } = await params;
  const ctx = await requireWorkspacePermission(workspaceSlug, "funnels:view");

  const funnel = await getFunnelForWorkspace(ctx.workspace.id, funnelId);
  const draftVersion = funnel.versions.find((v) => v.status === "DRAFT");

  if (!draftVersion) {
    // Sem rascunho ativo não há o que editar aqui — a página de visão
    // geral tem o botão "Criar rascunho para editar" (clona a versão
    // publicada). Evita duplicar esse fluxo dentro do builder.
    redirect(`/${workspaceSlug}/funnels/${funnelId}`);
  }

  const resolved = await resolveFunnelVersionForPreview(funnel.id, draftVersion.id);
  if (!resolved) {
    redirect(`/${workspaceSlug}/funnels/${funnelId}`);
  }

  const primaryProduct = funnel.products.find((p) => p.role === "PRIMARY");
  if (!primaryProduct) {
    redirect(`/${workspaceSlug}/funnels/${funnelId}`);
  }

  return (
    <FunnelBuilder
      workspaceSlug={workspaceSlug}
      funnel={{
        id: funnel.id,
        name: funnel.name,
        slug: funnel.slug,
        publicId: funnel.publicId,
        shopifyStoreId: funnel.shopifyStoreId,
      }}
      version={{ id: draftVersion.id, config: resolved.config, revision: draftVersion.revision }}
      primaryProductId={primaryProduct.productId}
      snapshot={resolved.snapshot}
      currency={funnel.shopifyStore.currency}
      initialUpsellProduct={
        resolved.upsellProduct
          ? {
              id: funnel.products.find((p) => p.role === "UPSELL")?.productId ?? "",
              title: resolved.upsellProduct.title,
              featuredImageUrl: resolved.upsellProduct.featuredImageUrl,
            }
          : null
      }
      canEdit={roleHasPermission(ctx.role, "funnels:edit")}
      canPublish={roleHasPermission(ctx.role, "funnels:publish")}
    />
  );
}
