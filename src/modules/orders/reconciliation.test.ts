import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

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
let orderItems: unknown[] = [];
let attempts: Array<Record<string, unknown>> = [];
let nextId = 1;

const db = {
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
      // Fase 4D: o Order local ONLINE nasce aqui, pela reconciliação.
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (orders.some((o) => (o as unknown as Record<string, unknown>).idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        const row = { ...data, id: `order_${nextId++}` } as unknown as FakeOrder;
        orders.push(row);
        return row;
      }),
    },
    orderItem: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
        orderItems.push(...data);
        return { count: data.length };
      }),
    },
    onlineCheckoutAttempt: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        attempts.find((a) => a.id === where.id) ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = attempts.find((a) => a.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    orderStatusHistory: {
      create: vi.fn(({ data }: { data: unknown }) => ({
        then(onFulfilled: (v: unknown) => void) {
          statusHistory.push(data);
          onFulfilled(data);
        },
      })),
    },
    // Suporta as duas formas: array (usada pela reconciliação COD, Fase 3)
    // e callback (usada pela criação de Order ONLINE, Fase 4D).
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(db);
      return Promise.all(arg as Promise<unknown>[]);
    }),
};

vi.mock("@/lib/db", () => ({ prisma: db }));

const { reconcileOrderCreatedWebhook, reconcileOrderUpdatedWebhook } = await import("./reconciliation");

beforeEach(() => {
  orders = [];
  statusHistory = [];
  orderItems = [];
  attempts = [];
  nextId = 1;
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

describe("reconcileOrderCreatedWebhook — checkout ONLINE (Fase 4D)", () => {
  const quoteSnapshot = {
    currency: "COP",
    subtotal: 179800,
    offerDiscount: 29900,
    paymentMethodDiscount: 5000,
    discountTotal: 34900,
    shippingTotal: 0,
    total: 144900,
    items: [
      {
        titleSnapshot: "Produto X",
        productId: "prod_1",
        productVariantId: "pv_1",
        shopifyProductId: "gid://shopify/Product/1",
        shopifyVariantId: "gid://shopify/ProductVariant/42",
        variantTitle: "Default",
        sku: "SKU-1",
        quantity: 2,
        unitPrice: 72450,
        lineSubtotal: 179800,
        discountTotal: 34900,
        lineTotal: 144900,
      },
    ],
  };

  function seedAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const attempt: Record<string, unknown> = {
      id: "att_1",
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      funnelId: "funnel_1",
      funnelVersionId: "version_1",
      currency: "COP",
      quoteSnapshot,
      orderId: null,
      status: "READY",
      ...overrides,
    };
    attempts.push(attempt);
    return attempt;
  }

  function onlinePayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 5001,
      name: "#1002",
      note_attributes: [{ name: "_appshopfy_checkout", value: "appshopfy_checkout_att_1" }],
      ...overrides,
    };
  }

  it("cria o Order local ONLINE a partir do quote congelado (nunca recalcula preço)", async () => {
    seedAttempt();

    const result = await reconcileOrderCreatedWebhook(onlinePayload());

    expect(result).toBe("online_checkout_created");
    expect(orders).toHaveLength(1);
    const order = orders[0] as unknown as Record<string, unknown>;
    expect(order.paymentMethod).toBe("ONLINE");
    expect(order.checkoutProvider).toBe("SHOPIFY_CHECKOUT");
    expect(order.total).toBe(144900);
    expect(order.paymentMethodDiscount).toBe(5000);
    // Sem CodLead: os dados do cliente ficam na Shopify.
    expect(order.codLeadId).toBeNull();
  });

  it("cria os OrderItems preservando variante e quantidade física", async () => {
    seedAttempt();
    await reconcileOrderCreatedWebhook(onlinePayload());

    expect(orderItems).toHaveLength(1);
    expect(orderItems[0]).toMatchObject({
      shopifyVariantId: "gid://shopify/ProductVariant/42",
      quantity: 2,
      lineTotal: 144900,
    });
  });

  it("marca a tentativa como COMPLETED e a vincula ao Order", async () => {
    const attempt = seedAttempt();
    await reconcileOrderCreatedWebhook(onlinePayload());

    expect(attempt.status).toBe("COMPLETED");
    expect(attempt.orderId).toBe(orders[0].id);
    expect(attempt.completedAt).toBeInstanceOf(Date);
  });

  it("reentrega do MESMO webhook é idempotente — nunca cria segundo Order", async () => {
    const attempt = seedAttempt();
    await reconcileOrderCreatedWebhook(onlinePayload());
    const second = await reconcileOrderCreatedWebhook(onlinePayload());

    expect(second).toBe("already_synced");
    expect(orders).toHaveLength(1);
    expect(orderItems).toHaveLength(1);
    expect(attempt.orderId).toBe(orders[0].id);
  });

  it("pedido sem nenhum identificador nosso continua sendo 'external' (nunca importa pedido alheio)", async () => {
    seedAttempt();
    const result = await reconcileOrderCreatedWebhook({ id: 9999, name: "#9999" });
    expect(result).toBe("external");
    expect(orders).toHaveLength(0);
  });

  it("note attribute com identidade desconhecida não cria nada", async () => {
    const result = await reconcileOrderCreatedWebhook(
      onlinePayload({ note_attributes: [{ name: "_appshopfy_checkout", value: "appshopfy_checkout_inexistente" }] })
    );
    expect(result).toBe("external");
    expect(orders).toHaveLength(0);
  });

  it("note attribute de outra integração é ignorado", async () => {
    seedAttempt();
    const result = await reconcileOrderCreatedWebhook(
      onlinePayload({ note_attributes: [{ name: "outro_app", value: "outro_checkout_123" }] })
    );
    expect(result).toBe("external");
    expect(orders).toHaveLength(0);
  });

  it("o Order ONLINE nasce já SYNCED (nunca é enfileirado para SHOPIFY_ORDER_CREATE)", async () => {
    seedAttempt();
    await reconcileOrderCreatedWebhook(onlinePayload());

    const order = orders[0] as unknown as Record<string, unknown>;
    expect(order.shopifySyncStatus).toBe("SYNCED");
    expect(order.shopifyOrderId).toBe("gid://shopify/Order/5001");
  });
});
