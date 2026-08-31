"use client";

import { Button } from "@/components/ui/button";

export function PublishConfirmModal({
  isPending,
  onConfirm,
  onCancel,
}: {
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-lg">
        <h2 id="publish-title" className="text-base font-semibold">
          ¿Publicar esta versión?
        </h2>
        <p className="text-sm text-neutral-600">Los visitantes comenzarán a ver esta versión.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending} autoFocus>
            {isPending ? "Publicando..." : "Publicar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
