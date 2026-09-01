import Link from "next/link";

import { listOrdersForWorkspace } from "@/modules/orders/admin/service";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";
import type { OrderStatus } from "@prisma/client";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  FULFILLED: "Despachado",
  DELIVERED: "Entregado",
  REFUSED: "Rechazado",
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
  FULFILLED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  REFUSED: "bg-neutral-200 text-neutral-700",
};

const SYNC_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SYNCING: "Sincronizando",
  SYNCED: "Sincronizado",
  FAILED: "Falló",
  REAUTH_REQUIRED: "Requiere reconexión",
  MANUAL_REVIEW: "Revisión manual",
};

const FILTER_TABS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  { value: "PENDING", label: "Pendiente" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "CANCELLED", label: "Cancelado" },
];

const VALID_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "CANCELLED", "FULFILLED", "DELIVERED", "REFUSED"];

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspacePermission(workspaceSlug, "orders:view");

  const status = VALID_STATUSES.includes(query.status as OrderStatus) ? (query.status as OrderStatus) : undefined;
  const search = query.search?.trim() ?? "";

  const orders = await listOrdersForWorkspace(ctx.workspace.id, { status, search: search || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="text-neutral-600">Pedidos COD do workspace {ctx.workspace.name}.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-sm">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={`/${workspaceSlug}/orders${tab.value ? `?status=${tab.value}` : ""}`}
              className={`rounded-full px-3 py-1.5 ${
                (query.status ?? "") === tab.value ? "bg-white font-medium shadow-sm" : "text-neutral-500"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="N.º de pedido"
            className="h-9 rounded-md border border-neutral-300 px-3 text-sm"
          />
          {status && <input type="hidden" name="status" value={status} />}
          <button type="submit" className="h-9 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50">
            Buscar
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum pedido encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Pedido</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Método</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Shopify</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${workspaceSlug}/orders/${order.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      #{order.orderNumber}
                    </Link>
                    <div className="text-neutral-500">{order.funnel.name}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{order.createdAt.toLocaleString("es-CO")}</td>
                  <td className="px-4 py-3">
                    {/* Pedido ONLINE (Fase 4D) não tem CodLead: os dados do
                        cliente ficam na Shopify, preenchidos no checkout dela. */}
                    {order.codLead ? (
                      <>
                        {order.codLead.name}
                        <div className="text-neutral-500">
                          {order.codLead.city}, {order.codLead.state}
                        </div>
                      </>
                    ) : (
                      <span className="text-neutral-500">Datos en Shopify</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {order.total.toString()} {order.currency}
                  </td>
                  <td className="px-4 py-3">{order.paymentMethod === "COD" ? "Contra entrega" : "En línea"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{SYNC_LABEL[order.shopifySyncStatus] ?? order.shopifySyncStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
