"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createDraftPreviewLinkAction } from "@/modules/funnels/admin/preview-actions";

export function PreviewDraftButton({ workspaceSlug, funnelId }: { workspaceSlug: string; funnelId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("funnelId", funnelId);
      const result = await createDraftPreviewLinkAction(workspaceSlug, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.data.previewUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Gerando link..." : "Pré-visualizar rascunho"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
