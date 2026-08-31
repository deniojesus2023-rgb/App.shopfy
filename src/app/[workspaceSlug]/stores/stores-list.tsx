"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { disconnectStoreAction } from "@/modules/shopify/stores/actions";
import type { ShopifyStore } from "@prisma/client";

const STATUS_LABEL: Record<ShopifyStore["status"], string> = {
  CONNECTED: "Conectada",
  DISCONNECTED: "Desconectada",
  REAUTH_REQUIRED: "Reautorização necessária",
};

const STATUS_CLASS: Record<ShopifyStore["status"], string> = {
  CONNECTED: "bg-green-100 text-green-700",
  DISCONNECTED: "bg-neutral-100 text-neutral-600",
  REAUTH_REQUIRED: "bg-amber-100 text-amber-700",
};

export function StoresList({
  workspaceSlug,
  stores,
  canManage,
}: {
  workspaceSlug: string;
  stores: ShopifyStore[];
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (stores.length === 0) {
    return <p className="text-sm text-neutral-500">Nenhuma loja conectada ainda.</p>;
  }

  function handleDisconnect(storeId: string) {
    if (!confirm("Desconectar esta loja? A integração será interrompida.")) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("storeId", storeId);
      const result = await disconnectStoreAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {stores.map((store) => (
          <li
            key={store.id}
            className="flex items-center justify-between rounded-md border border-neutral-200 px-4 py-3 text-sm"
          >
            <div>
              <div className="font-medium">{store.displayName ?? store.shopDomain}</div>
              <div className="text-neutral-500">{store.shopDomain}</div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[store.status]}`}
              >
                {STATUS_LABEL[store.status]}
              </span>
              {store.status === "CONNECTED" && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`/${workspaceSlug}/stores/${store.id}/products`}>Ver produtos</Link>
                </Button>
              )}
              {canManage && store.status === "CONNECTED" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleDisconnect(store.id)}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
