import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FunnelRuntime } from "@/components/storefront/FunnelRuntime";
import { resolvePublicFunnel } from "@/modules/funnels/runtime/resolve";

interface PageParams {
  publicId: string;
  slug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const resolved = await resolvePublicFunnel(publicId);

  if (!resolved) {
    return { title: "Página não encontrada" };
  }

  const title = resolved.snapshot.title || resolved.funnel.name;
  return {
    title,
    description: `${title} — oferta especial`,
    openGraph: {
      title,
      images: resolved.snapshot.featuredImageUrl ? [resolved.snapshot.featuredImageUrl] : undefined,
    },
  };
}

export default async function PublicFunnelPage({ params }: { params: Promise<PageParams> }) {
  const { publicId, slug } = await params;
  const resolved = await resolvePublicFunnel(publicId);

  if (!resolved) {
    notFound();
  }

  // Slug é cosmético/SEO, não usado para resolução — se o funil foi
  // renomeado, redireciona para a URL canônica em vez de servir com o
  // slug velho (nunca aceita um `redirect` vindo do client: o destino é
  // sempre construído aqui, a partir do slug atual no banco).
  if (slug !== resolved.funnel.slug) {
    redirect(`/f/${publicId}/${resolved.funnel.slug}`);
  }

  return <FunnelRuntime resolved={resolved} />;
}
