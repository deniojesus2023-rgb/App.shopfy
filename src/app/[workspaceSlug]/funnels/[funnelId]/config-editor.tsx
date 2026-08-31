"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateDraftConfigAction } from "@/modules/funnels/actions";

export function ConfigEditor({
  workspaceSlug,
  funnelId,
  versionId,
  revision,
  initialConfig,
}: {
  workspaceSlug: string;
  funnelId: string;
  versionId: string;
  revision: number;
  initialConfig: unknown;
}) {
  const [configJson, setConfigJson] = useState(JSON.stringify(initialConfig, null, 2));
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("versionId", versionId);
      formData.set("expectedRevision", String(currentRevision));
      formData.set("configJson", configJson);

      const result = await updateDraftConfigAction(workspaceSlug, funnelId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentRevision(result.data.revision);
      setSuccess(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        Editor temporário (JSON bruto) — o editor visual chega numa fase futura. O conteúdo é
        validado no servidor (schema estrutural + regras semânticas) antes de salvar.
      </p>
      <textarea
        value={configJson}
        onChange={(e) => setConfigJson(e.target.value)}
        rows={24}
        spellCheck={false}
        className="w-full rounded-md border border-neutral-300 bg-neutral-950 p-3 font-mono text-xs text-neutral-100"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && !error && <p className="text-sm text-green-600">Rascunho salvo.</p>}
      <div>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar rascunho"}
        </Button>
      </div>
    </div>
  );
}
