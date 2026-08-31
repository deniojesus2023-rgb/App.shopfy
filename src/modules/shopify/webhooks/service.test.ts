import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

interface FakeEventRow {
  id: string;
  shopDomain: string;
  topic: string;
  shopifyWebhookId: string;
  payload: unknown;
  status: string;
  workspaceId: string | null;
  shopifyStoreId: string | null;
  processedAt: Date | null;
  error: string | null;
}

interface FakeStoreRow {
  id: string;
  workspaceId: string;
  shopDomain: string;
  status: string;
  disconnectedAt: Date | null;
  accessTokenEncrypted: string | null;
}

let events: FakeEventRow[] = [];
let stores: FakeStoreRow[] = [];
let nextId = 1;

const enqueueJobMock = vi.fn(async () => ({}) as never);

vi.mock("@/modules/queue/service", () => ({ enqueueJob: enqueueJobMock }));
vi.mock("@/modules/audit/service", () => ({ logAudit: vi.fn(async () => undefined) }));

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyStore: {
      findUnique: vi.fn(async ({ where }: { where: { shopDomain: string } }) => {
        return stores.find((s) => s.shopDomain === where.shopDomain) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeStoreRow> }) => {
        const row = stores.find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    shopifyWebhookEvent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<FakeEventRow, "id" | "status" | "processedAt" | "error">;
        }) => {
          if (events.some((e) => e.shopifyWebhookId === data.shopifyWebhookId)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
              code: "P2002",
              clientVersion: "6.19.3",
            });
          }
          const row: FakeEventRow = {
            id: `evt_${nextId++}`,
            status: "RECEIVED",
            processedAt: null,
            error: null,
            ...data,
          };
          events.push(row);
          return row;
        }
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return events.find((e) => e.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeEventRow> }) => {
        const row = events.find((e) => e.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

const { persistWebhookEvent, processWebhookEvent } = await import("./service");

beforeEach(() => {
  events = [];
  stores = [];
  nextId = 1;
  enqueueJobMock.mockClear();
});

describe("persistWebhookEvent (idempotência)", () => {
  it("persiste um webhook novo", async () => {
    const result = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });

    expect(result.outcome).toBe("created");
    expect(events).toHaveLength(1);
  });

  it("trata reentrega do mesmo shopifyWebhookId como duplicata, sem criar segunda linha", async () => {
    const first = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });
    const second = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("duplicate");
    expect(events).toHaveLength(1);
  });

  it("dois shopifyWebhookId diferentes geram duas linhas", async () => {
    await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });
    await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_2",
      payload: { id: 2 },
    });

    expect(events).toHaveLength(2);
  });
});

describe("processWebhookEvent", () => {
  function seedEvent(overrides: Partial<FakeEventRow>): FakeEventRow {
    const row: FakeEventRow = {
      id: `evt_${nextId++}`,
      shopDomain: "loja.myshopify.com",
      topic: "products/update",
      shopifyWebhookId: `wh_${nextId}`,
      payload: { id: 123456789 },
      status: "RECEIVED",
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      processedAt: null,
      error: null,
      ...overrides,
    };
    events.push(row);
    return row;
  }

  it("products/update enfileira SHOPIFY_PRODUCT_SYNC com o GID derivado do id numérico", async () => {
    const event = seedEvent({ topic: "products/update", payload: { id: 123456789 } });

    await processWebhookEvent(event.id);

    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SHOPIFY_PRODUCT_SYNC",
        payload: expect.objectContaining({
          shopifyProductId: "gid://shopify/Product/123456789",
          workspaceId: "ws_1",
          shopifyStoreId: "store_1",
        }),
      })
    );
    expect(events.find((e) => e.id === event.id)!.status).toBe("PROCESSED");
  });

  it("products/delete enfileira SHOPIFY_PRODUCT_DELETE", async () => {
    const event = seedEvent({ topic: "products/delete", payload: { id: 987 } });

    await processWebhookEvent(event.id);

    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SHOPIFY_PRODUCT_DELETE",
        payload: expect.objectContaining({ shopifyProductId: "gid://shopify/Product/987" }),
      })
    );
  });

  it("app/uninstalled desconecta a loja sem passar pela fila", async () => {
    stores.push({
      id: "store_1",
      workspaceId: "ws_1",
      shopDomain: "loja.myshopify.com",
      status: "CONNECTED",
      disconnectedAt: null,
      accessTokenEncrypted: "encrypted-token",
    });
    const event = seedEvent({ topic: "app/uninstalled", payload: {} });

    await processWebhookEvent(event.id);

    expect(enqueueJobMock).not.toHaveBeenCalled();
    expect(stores[0].status).toBe("DISCONNECTED");
    expect(stores[0].accessTokenEncrypted).toBeNull();
    expect(events.find((e) => e.id === event.id)!.status).toBe("PROCESSED");
  });

  it("tópico ainda não processado nesta fase fica IGNORED", async () => {
    const event = seedEvent({ topic: "orders/create", payload: {} });

    await processWebhookEvent(event.id);

    expect(events.find((e) => e.id === event.id)!.status).toBe("IGNORED");
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("evento sem workspaceId resolvido marca FAILED em vez de enfileirar", async () => {
    const event = seedEvent({ topic: "products/update", workspaceId: null, shopifyStoreId: null });

    await processWebhookEvent(event.id);

    expect(enqueueJobMock).not.toHaveBeenCalled();
    expect(events.find((e) => e.id === event.id)!.status).toBe("FAILED");
  });

  it("ignora evento que não está mais RECEIVED (evita reprocessar)", async () => {
    const event = seedEvent({ topic: "products/update", status: "PROCESSED" });

    await processWebhookEvent(event.id);

    expect(enqueueJobMock).not.toHaveBeenCalled();
  });
});
