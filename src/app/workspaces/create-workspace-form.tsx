"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "@/modules/workspaces/actions";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/${state.data.slug}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome do workspace</Label>
        <Input id="name" name="name" placeholder="Minha Loja" required maxLength={80} />
        {state && !state.ok && state.fieldErrors?.name && (
          <p className="text-sm text-red-600">{state.fieldErrors.name[0]}</p>
        )}
      </div>
      {state && !state.ok && !state.fieldErrors && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando..." : "Criar workspace"}
      </Button>
    </form>
  );
}
