"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { archiveFunnelAction, ensureDraftVersionAction, publishFunnelAction } from "@/modules/funnels/actions";

export function CreateDraftButton({ workspaceSlug, funnelId }: { workspaceSlug: string; funnelId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await ensureDraftVersionAction(workspaceSlug, funnelId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {isPending ? "Criando rascunho..." : "Criar rascunho para editar"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function PublishButton({ workspaceSlug, funnelId }: { workspaceSlug: string; funnelId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    if (!confirm("Publicar este funil? A versão atual publicada será substituída.")) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("funnelId", funnelId);
      const result = await publishFunnelAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handlePublish} disabled={isPending}>
        {isPending ? "Publicando..." : "Publicar"}
      </Button>
      {error && <p className="max-w-xs text-right text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function ArchiveButton({ workspaceSlug, funnelId }: { workspaceSlug: string; funnelId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    if (!confirm("Arquivar este funil?")) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("funnelId", funnelId);
      const result = await archiveFunnelAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" onClick={handleArchive} disabled={isPending}>
        {isPending ? "Arquivando..." : "Arquivar"}
      </Button>
      {error && <p className="max-w-xs text-right text-sm text-red-600">{error}</p>}
    </div>
  );
}
