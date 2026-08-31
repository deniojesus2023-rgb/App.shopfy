"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteMemberAction } from "@/modules/workspaces/actions";

export function InviteMemberForm({ workspaceSlug }: { workspaceSlug: string }) {
  const boundAction = inviteMemberAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(boundAction, null);
  const [copied, setCopied] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" placeholder="pessoa@empresa.com" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Papel</Label>
          <select
            id="role"
            name="role"
            defaultValue="MEMBER"
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            <option value="ADMIN">ADMIN</option>
            <option value="MEMBER">MEMBER</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Convidando..." : "Convidar"}
          </Button>
        </div>
      </div>

      {state && !state.ok && (
        <p className="text-sm text-red-600">
          {state.fieldErrors?.email?.[0] ?? state.fieldErrors?.role?.[0] ?? state.error}
        </p>
      )}

      {state?.ok && (
        <div className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <p className="text-neutral-600">
            Convite criado. Envie este link para a pessoa convidada (envio automático por
            e-mail chega em uma fase futura):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs">
              {state.data.inviteUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.data.inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
