import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeOrder {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  currency: string;
  orderNumber: number;
  shopifyOrderId: string | null;
  shopifySyncStatus: string;
  codLead: { name: string; phone: string; address: string; city: string; state: string; country: string };
  items: Array<{ titleSnapshot: string; quantity: number; unitPrice: { toString(): string } }>;
  shopifyStore: { id: string; shopDomain: string; status: string };
}

let orders: FakeOrder[] = [];
let syncEnabled = true;

const logAuditMock = vi.fn(async () => undefined);
const getDecryptedAccessTokenMock = vi.fn(async () => "shpat_token");
const createShopifyOrderMock = vi.fn();
const findShopifyOrderByInternalTagMock = vi.fn<
  () => Promise<{ shopifyOrderId: string; shopifyOrderName: string; shopifyCreatedAt: string } | null>
>(async () => null);

vi.mock("@/lib/env", () => ({
  get env() {
    return { SHOPIFY_ORDER_SYNC_ENABLED: syncEnabled };
  },
}));
vi.mock("@/modules/audit/service", () => ({ logAudit: logAuditMock }));
vi.mock("@/modules/shopify/stores/service", () => ({
  getDecryptedAccessToken: getDecryptedAccessTokenMock,
}));
vi.mock("@/modules/shopify/orders", () => ({
  createShopifyOrder: createShopifyOrderMock,
  findShopifyOrderByInternalTag: findShopifyOrderByInternalTagMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orders.find((o) => o.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeOrder> }) => {
        const row = orders.find((o) => o.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    shopifyStore: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const row = orders.find((o) => o.shopifyStoreId === where.id);
        if (row) row.shopifyStore.status = data.status;
        return { id: where.id, ...data };
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

const { processShopifyOrderCreateJob } = await import("./shopify-order-create");
const { ShopifyAuthError, ShopifyThrottledError } = await import("@/modules/shopify/client");
const { NonRetryableJobError } = await import("@/modules/queue/errors");

function seedOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  const order: FakeOrder = {
    id: "corder00000000000000000001",
    workspaceId: "ws_1",
    shopifyStoreId: "store_1",
    currency: "COP",
    orderNumber: 1048,
    shopifyOrderId: null,
    shopifySyncStatus: "PENDING",
    codLead: { name: "Maria", phone: "+57 300", address: "Calle 1", city: "Medellín", state: "Antioquia", country: "CO" },
    items: [{ titleSnapshot: "Produto X", quantity: 1, unitPrice: { toString: () => "100.00" } }],
    shopifyStore: { id: "store_1", shopDomain: "loja.myshopify.com", status: "CONNECTED" },
    ...overrides,
  };
  orders.push(order);
  return order;
}

beforeEach(() => {
  orders = [];
  syncEnabled = true;
  logAuditMock.mockClear();
  getDecryptedAccessTokenMock.mockClear();
  getDecryptedAccessTokenMock.mockResolvedValue("shpat_token");
  createShopifyOrderMock.mockReset();
  findShopifyOrderByInternalTagMock.mockReset();
  findShopifyOrderByInternalTagMock.mockResolvedValue(null);
});

describe("processShopifyOrderCreateJob", () => {
  it("idempotente: se o Order já tem shopifyOrderId, nunca chama a Shopify de novo", async () => {
    seedOrder({ shopifyOrderId: "gid://shopify/Order/1", shopifySyncStatus: "SYNCING" });

    await processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" });

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("com SHOPIFY_ORDER_SYNC_ENABLED=false nunca chama a Shopify (dev/test seguro por padrão)", async () => {
    syncEnabled = false;
    seedOrder();

    await processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" });

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("PENDING");
  });

  it("nunca marca PAID/simula pagamento — o quote enviado é o do item local, financialStatus é sempre PENDING no client Shopify", async () => {
    seedOrder();
    createShopifyOrderMock.mockResolvedValue({
      outcome: "created",
      result: { shopifyOrderId: "gid://shopify/Order/1", shopifyOrderName: "#1001", shopifyCreatedAt: "2026-01-01T00:00:00Z" },
    });

    await processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" });

    const call = createShopifyOrderMock.mock.calls[0];
    expect(call[2]).toMatchObject({ lineItems: [{ title: "Produto X", quantity: 1, unitPrice: "100.00" }] });
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/1");
  });

  it("reconciliação: se já existe pedido com a tag interna, nunca cria de novo", async () => {
    seedOrder();
    findShopifyOrderByInternalTagMock.mockResolvedValue({
      shopifyOrderId: "gid://shopify/Order/9",
      shopifyOrderName: "#999",
      shopifyCreatedAt: "2026-01-01T00:00:00Z",
    });

    await processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" });

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/9");
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("userErrors da Shopify: marca FAILED e nunca retenta (não-retryable)", async () => {
    seedOrder();
    createShopifyOrderMock.mockResolvedValue({ outcome: "userErrors", errors: ["Endereço inválido"] });

    await expect(processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" })).rejects.toThrow(
      NonRetryableJobError
    );
    expect(orders[0].shopifySyncStatus).toBe("FAILED");
  });

  it("ShopifyAuthError (401): marca REAUTH_REQUIRED no Order e na loja, não-retryable", async () => {
    seedOrder();
    createShopifyOrderMock.mockRejectedValue(new ShopifyAuthError());

    await expect(processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" })).rejects.toThrow(
      NonRetryableJobError
    );
    expect(orders[0].shopifySyncStatus).toBe("REAUTH_REQUIRED");
    expect(orders[0].shopifyStore.status).toBe("REAUTH_REQUIRED");
  });

  it("throttle/instabilidade: deixa o erro subir para a fila retentar (não vira NonRetryableJobError)", async () => {
    seedOrder();
    createShopifyOrderMock.mockRejectedValue(new ShopifyThrottledError());

    await expect(processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" })).rejects.toThrow(
      ShopifyThrottledError
    );
    expect(orders[0].shopifySyncStatus).toBe("SYNCING");
  });

  it("loja desconectada: falha não-retryable sem tentar a rede", async () => {
    seedOrder({ shopifyStore: { id: "store_1", shopDomain: "loja.myshopify.com", status: "DISCONNECTED" } });

    await expect(processShopifyOrderCreateJob({ orderId: "corder00000000000000000001" })).rejects.toThrow(
      NonRetryableJobError
    );
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("FAILED");
  });
});
