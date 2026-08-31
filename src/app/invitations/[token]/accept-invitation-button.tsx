"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/modules/workspaces/actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(acceptInvitationAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/${state.data.workspaceSlug}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Aceitando..." : "Aceitar convite"}
      </Button>
    </form>
  );
}
