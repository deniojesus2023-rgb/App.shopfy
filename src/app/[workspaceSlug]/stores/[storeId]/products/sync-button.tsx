"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { triggerFullCatalogSyncAction } from "@/modules/catalog/actions";

export function SyncButton({ workspaceSlug, storeId }: { workspaceSlug: string; storeId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [justTriggered, setJustTriggered] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("storeId", storeId);
      const result = await triggerFullCatalogSyncAction(workspaceSlug, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setJustTriggered(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handleSync} disabled={isPending}>
        {isPending ? "Enviando..." : "Sincronizar produtos"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {justTriggered && !error && (
        <p className="text-sm text-neutral-500">
          Sincronização iniciada — atualize a página em instantes.
        </p>
      )}
    </div>
  );
}
