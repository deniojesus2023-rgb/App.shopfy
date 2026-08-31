"use client";

import { Button } from "@/components/ui/button";

export function ConflictModal({
  onReload,
  onKeepEditing,
}: {
  onReload: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 id="conflict-title" className="text-base font-semibold">
          Este embudo fue modificado en otra sesión.
        </h2>
        <p className="text-sm text-neutral-600">
          Alguém salvou uma alteração neste rascunho enquanto você editava. Suas alterações locais
          ainda não foram salvas.
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={onReload} autoFocus>
            Recargar versión actual
          </Button>
          <Button type="button" variant="outline" onClick={onKeepEditing}>
            Mantener mis cambios temporalmente
          </Button>
        </div>
      </div>
    </div>
  );
}
