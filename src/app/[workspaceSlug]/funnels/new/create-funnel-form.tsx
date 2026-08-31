"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFunnelAction } from "@/modules/funnels/admin/actions";

function slugifyClient(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateFunnelForm({
  workspaceSlug,
  shopifyStoreId,
  productId,
  templates,
}: {
  workspaceSlug: string;
  shopifyStoreId: string;
  productId: string;
  templates: { key: string; name: string; description: string | null }[];
}) {
  const router = useRouter();
  const boundAction = createFunnelAction.bind(null, workspaceSlug);
  const [state, formAction, isPending] = useActionState(boundAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      // Vai direto para o builder — o funil recém-criado já nasce com uma
      // v1 DRAFT baseada no template escolhido.
      router.push(`/${workspaceSlug}/funnels/${state.data.funnelId}/builder`);
    }
  }, [state, router, workspaceSlug]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="shopifyStoreId" value={shopifyStoreId} />
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateKey">Template</Label>
        <select
          id="templateKey"
          name="templateKey"
          required
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome do funil</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugifyClient(e.target.value));
          }}
        />
        {state && !state.ok && state.fieldErrors?.name && (
          <p className="text-sm text-red-600">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          maxLength={120}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="gerado a partir do nome"
        />
      </div>

      {state && !state.ok && !state.fieldErrors && <p className="text-sm text-red-600">{state.error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando..." : "Criar funil"}
      </Button>
    </form>
  );
}
