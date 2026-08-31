import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FunnelRuntime } from "@/components/storefront/FunnelRuntime";
import { resolveFunnelVersionForPreview } from "@/modules/funnels/runtime/resolve";
import { verifyPreviewToken } from "@/modules/funnels/runtime/preview-token";

// Preview nunca é indexável e nunca passa pela camada de cache pública —
// sempre lê o estado atual (que pode ser um DRAFT em edição).
export const metadata: Metadata = {
  title: "Pré-visualização",
  robots: { index: false, follow: false },
};

export default async function FunnelPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyPreviewToken(token);
  if (!payload) {
    notFound();
  }

  const resolved = await resolveFunnelVersionForPreview(payload.funnelId, payload.versionId);
  if (!resolved) {
    notFound();
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        Pré-visualização — este link expira em alguns minutos e não é a página pública
      </div>
      <FunnelRuntime resolved={resolved} />
    </div>
  );
}
