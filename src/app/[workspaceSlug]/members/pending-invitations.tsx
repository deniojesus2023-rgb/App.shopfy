"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { revokeInvitationAction } from "@/modules/workspaces/actions";
import type { Invitation } from "@prisma/client";

export function PendingInvitations({
  workspaceSlug,
  invitations,
}: {
  workspaceSlug: string;
  invitations: Pick<Invitation, "id" | "email" | "role" | "expiresAt">[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  function handleRevoke(invitationId: string) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("invitationId", invitationId);
      const result = await revokeInvitationAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-2 text-sm"
          >
            <div>
              <span className="font-medium">{inv.email}</span>{" "}
              <span className="text-neutral-500">— convidado como {inv.role}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => handleRevoke(inv.id)}
            >
              Revogar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
