"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { BuilderState } from "./builder-state";

const STATUS_LABEL: Record<BuilderState["saveStatus"], string> = {
  idle: "",
  saving: "Guardando...",
  saved: "Guardado",
  error: "Erro ao salvar",
  conflict: "Conflito",
};

export function BuilderHeader({
  workspaceSlug,
  funnelId,
  funnelName,
  state,
  canEdit,
  canPublish,
  publishBlockedReason,
  onSave,
  onPublishClick,
}: {
  workspaceSlug: string;
  funnelId: string;
  funnelName: string;
  state: BuilderState;
  canEdit: boolean;
  canPublish: boolean;
  publishBlockedReason: string | null;
  onSave: () => void;
  onPublishClick: () => void;
}) {
  function handleBackClick(e: React.MouseEvent) {
    if (state.dirty) {
      const confirmed = confirm("Você tem alterações não salvas. Sair mesmo assim?");
      if (!confirmed) e.preventDefault();
    }
  }

  const statusText = state.dirty && state.saveStatus !== "saving" ? "Cambios sin guardar" : STATUS_LABEL[state.saveStatus];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <Link
          href={`/${workspaceSlug}/funnels/${funnelId}`}
          onClick={handleBackClick}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Funis
        </Link>
        <h1 className="text-sm font-semibold">{funnelName}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span
          role="status"
          aria-live="polite"
          className={`text-xs ${state.saveStatus === "error" || state.saveStatus === "conflict" ? "text-red-600" : "text-neutral-500"}`}
        >
          {statusText}
        </span>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={onSave} disabled={!state.dirty || state.saveStatus === "saving"}>
            Guardar cambios
          </Button>
        )}
        {canPublish && (
          <Button
            type="button"
            size="sm"
            onClick={onPublishClick}
            disabled={publishBlockedReason !== null}
            title={publishBlockedReason ?? undefined}
          >
            Publicar
          </Button>
        )}
      </div>
    </header>
  );
}
