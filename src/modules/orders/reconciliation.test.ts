import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeOrder {
  id: string;
  workspaceId: string;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  shopifySyncStatus: string;
  status: string;
  cancelledAt: Date | null;
}

let orders: FakeOrder[] = [];
let statusHistory: unknown[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orders.find((o) => o.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { shopifyOrderId: string } }) =>
        orders.find((o) => o.shopifyOrderId === where.shopifyOrderId) ?? null
      ),
      // Retorna um "thenable" preguiçoso, não uma Promise já resolvida: o
      // Prisma real só executa a query quando `$transaction([...])` é
      // awaited, nunca no instante em que `prisma.order.update(...)` é
      // chamado — isso importa aqui porque `orderStatusHistory.create`
      // lê `order.status` (o objeto JS local) na MESMA expressão de array,
      // antes de qualquer coisa ser awaited. Mutar de forma síncrona no
      // momento da chamada (como uma função `async` sem `await` faz)
      // corromperia esse `fromStatus` no teste.
      update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<FakeOrder> }) => ({
        then(onFulfilled: (v: FakeOrder) => void) {
          const row = orders.find((o) => o.id === where.id)!;
          Object.assign(row, data);
          onFulfilled(row);
        },
      })),
    },
    orderStatusHistory: {
      create: vi.fn(({ data }: { data: unknown }) => ({
        then(onFulfilled: (v: unknown) => void) {
          statusHistory.push(data);
          onFulfilled(data);
        },
      })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const { reconcileOrderCreatedWebhook, reconcileOrderUpdatedWebhook } = await import("./reconciliation");

beforeEach(() => {
  orders = [];
  statusHistory = [];
});

describe("reconcileOrderCreatedWebhook", () => {
  it("(A) source_identifier bate com um Order nosso — reconcilia, nunca duplica", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: null,
      shopifyOrderName: null,
      shopifySyncStatus: "PENDING",
      status: "PENDING",
      cancelledAt: null,
    });

    const outcome = await reconcileOrderCreatedWebhook({
      id: 999,
      name: "#999",
      source_identifier: "appshopfy_order_corder1",
    });

    expect(outcome).toBe("reconciled");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/999");
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("source_identifier tem precedência sobre a tag (tag pode ter sido editada na Shopify)", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: null,
      shopifyOrderName: null,
      shopifySyncStatus: "PENDING",
      status: "PENDING",
      cancelledAt: null,
    });

    const outcome = await reconcileOrderCreatedWebhook({
      id: 999,
      source_identifier: "appshopfy_order_corder1",
      tags: "cod, internal_order_outro_pedido",
    });

    expect(outcome).toBe("reconciled");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/999");
  });

  it("(A) fallback pela tag continua funcionando para pedidos criados antes do sourceIdentifier", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: null,
      shopifyOrderName: null,
      shopifySyncStatus: "PENDING",
      status: "PENDING",
      cancelledAt: null,
    });

    const outcome = await reconcileOrderCreatedWebhook({ id: 999, name: "#999", tags: "cod, internal_order_corder1" });

    expect(outcome).toBe("reconciled");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/999");
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("(B) pedido criado direto na Shopify (sem tag nossa) nunca é importado/duplicado", async () => {
    const outcome = await reconcileOrderCreatedWebhook({ id: 1, name: "#1", tags: "" });
    expect(outcome).toBe("external");
    expect(orders).toHaveLength(0);
  });

  it("tag presente mas apontando para um Order que não existe mais — trata como external, não lança", async () => {
    const outcome = await reconcileOrderCreatedWebhook({ id: 1, tags: "internal_order_ghost" });
    expect(outcome).toBe("external");
  });

  it("já sincronizado antes (idempotente) — não sobrescreve", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#1",
      shopifySyncStatus: "SYNCED",
      status: "PENDING",
      cancelledAt: null,
    });
    const outcome = await reconcileOrderCreatedWebhook({ id: 2, tags: "internal_order_corder1" });
    expect(outcome).toBe("already_synced");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/1");
  });
});

describe("reconcileOrderUpdatedWebhook", () => {
  it("cancelamento gera transição CANCELLED com OrderStatusHistory(source: SHOPIFY)", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#1",
      shopifySyncStatus: "SYNCED",
      status: "PENDING",
      cancelledAt: null,
    });

    const outcome = await reconcileOrderUpdatedWebhook({ id: 1, cancelled_at: "2026-01-01T00:00:00Z" });

    expect(outcome).toBe("updated");
    expect(orders[0].status).toBe("CANCELLED");
    expect(statusHistory).toEqual([
      expect.objectContaining({ orderId: "corder1", fromStatus: "PENDING", toStatus: "CANCELLED", source: "SHOPIFY" }),
    ]);
  });

  it("fulfillment marca FULFILLED", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#1",
      shopifySyncStatus: "SYNCED",
      status: "PENDING",
      cancelledAt: null,
    });

    const outcome = await reconcileOrderUpdatedWebhook({ id: 1, fulfillment_status: "fulfilled" });
    expect(outcome).toBe("updated");
    expect(orders[0].status).toBe("FULFILLED");
  });

  it("pedido não resolvido localmente (shopifyOrderId não bate com nada nosso) é ignorado", async () => {
    const outcome = await reconcileOrderUpdatedWebhook({ id: 999, cancelled_at: "2026-01-01T00:00:00Z" });
    expect(outcome).toBe("not_ours");
  });

  it("sem sinal relevante (nem cancelamento nem fulfillment) não altera nada", async () => {
    orders.push({
      id: "corder1",
      workspaceId: "ws_1",
      shopifyOrderId: "gid://shopify/Order/1",
      shopifyOrderName: "#1",
      shopifySyncStatus: "SYNCED",
      status: "PENDING",
      cancelledAt: null,
    });
    const outcome = await reconcileOrderUpdatedWebhook({ id: 1, financial_status: "paid" });
    expect(outcome).toBe("no_change");
    expect(orders[0].status).toBe("PENDING");
  });
});
