import Link from "next/link";

import { getOrderForWorkspace } from "@/modules/orders/admin/service";
import { requireWorkspacePermission } from "@/modules/workspaces/tenant";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  FULFILLED: "Despachado",
  DELIVERED: "Entregado",
  REFUSED: "Rechazado",
};

const SYNC_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SYNCING: "Sincronizando",
  SYNCED: "Sincronizado",
  FAILED: "Falló",
  REAUTH_REQUIRED: "Requiere reconexión",
  MANUAL_REVIEW: "Revisión manual (posible duplicado en Shopify)",
};

const SOURCE_LABEL: Record<string, string> = {
  STOREFRONT: "Cliente",
  SYSTEM: "Sistema",
  SHOPIFY: "Shopify",
  ADMIN: "Admin",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; orderId: string }>;
}) {
  const { workspaceSlug, orderId } = await params;
  const ctx = await requireWorkspacePermission(workspaceSlug, "orders:view");
  const order = await getOrderForWorkspace(ctx.workspace.id, orderId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${workspaceSlug}/orders`} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Pedidos
        </Link>
        <h1 className="text-2xl font-semibold">Pedido #{order.orderNumber}</h1>
        <p className="text-neutral-600">{order.funnel.name}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Pedido</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Status">{STATUS_LABEL[order.status] ?? order.status}</Row>
            <Row label="Método de pago">{order.paymentMethod === "COD" ? "Contra entrega" : "En línea"}</Row>
            <Row label="Subtotal">
              {order.subtotal.toString()} {order.currency}
            </Row>
            <Row label="Descuento">
              {order.discountTotal.toString()} {order.currency}
            </Row>
            <Row label="Envío">
              {order.shippingTotal.toString()} {order.currency}
            </Row>
            <Row label="Total">
              <span className="font-semibold">
                {order.total.toString()} {order.currency}
              </span>
            </Row>
            <Row label="Creado">{order.createdAt.toLocaleString("es-CO")}</Row>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Integración Shopify</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Estado de sincronización">
              {SYNC_LABEL[order.shopifySyncStatus] ?? order.shopifySyncStatus}
            </Row>
            <Row label="Pedido Shopify">{order.shopifyOrderName ?? "—"}</Row>
            <Row label="Creado en Shopify">
              {order.shopifyCreatedAt ? order.shopifyCreatedAt.toLocaleString("es-CO") : "—"}
            </Row>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Cliente y dirección</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label="Nombre">{order.codLead.name}</Row>
            <Row label="Teléfono">{order.codLead.phone}</Row>
            {order.codLead.whatsapp && <Row label="WhatsApp">{order.codLead.whatsapp}</Row>}
            <Row label="Dirección">{order.codLead.address}</Row>
            {order.codLead.addressReference && <Row label="Referencia">{order.codLead.addressReference}</Row>}
            <Row label="Ciudad">
              {order.codLead.city}, {order.codLead.state}, {order.codLead.country}
            </Row>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Ítems</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between border-b border-neutral-100 pb-2 last:border-0">
                <span>
                  {item.titleSnapshot} × {item.quantity}
                </span>
                <span className="font-medium">
                  {item.lineTotal.toString()} {order.currency}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">Histórico</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.statusHistory.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-0">
              <span>
                {entry.fromStatus ? `${STATUS_LABEL[entry.fromStatus] ?? entry.fromStatus} → ` : ""}
                {STATUS_LABEL[entry.toStatus] ?? entry.toStatus}
                <span className="ml-2 text-xs text-neutral-400">({SOURCE_LABEL[entry.source] ?? entry.source})</span>
              </span>
              <span className="text-neutral-500">{entry.createdAt.toLocaleString("es-CO")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
