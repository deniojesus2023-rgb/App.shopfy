import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

interface FakeOrder {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  currency: string;
  orderNumber: number;
  total: Prisma.Decimal;
  shopifyOrderId: string | null;
  shopifyOrderName?: string | null;
  shopifySyncStatus: string;
  codLead: { name: string; phone: string; address: string; city: string; state: string; country: string };
  items: Array<{ titleSnapshot: string; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }>;
  shopifyStore: { id: string; shopDomain: string; status: string };
}

let orders: FakeOrder[] = [];
let syncEnabled = true;

const logAuditMock = vi.fn(async () => undefined);
const getDecryptedAccessTokenMock = vi.fn(async () => "shpat_token");
const createShopifyOrderMock = vi.fn();
const findShopifyOrdersBySourceIdentifierMock = vi.fn<
  () => Promise<Array<{ shopifyOrderId: string; shopifyOrderName: string; shopifyCreatedAt: string }>>
>(async () => []);

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
  findShopifyOrdersBySourceIdentifier: findShopifyOrdersBySourceIdentifierMock,
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

const { processShopifyOrderCreateJob, classifyShopifyFailure } = await import("./shopify-order-create");
const { ShopifyApiError, ShopifyAuthError, ShopifyThrottledError, ShopifyTimeoutError } = await import(
  "@/modules/shopify/client"
);
const { NonRetryableJobError } = await import("@/modules/queue/errors");

const ORDER_ID = "corder00000000000000000001";
const SOURCE_IDENTIFIER = `appshopfy_order_${ORDER_ID}`;

const shopifyRef = {
  shopifyOrderId: "gid://shopify/Order/1",
  shopifyOrderName: "#1001",
  shopifyCreatedAt: "2026-01-01T00:00:00Z",
};

function seedOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  const order: FakeOrder = {
    id: ORDER_ID,
    workspaceId: "ws_1",
    shopifyStoreId: "store_1",
    currency: "COP",
    orderNumber: 1048,
    total: new Prisma.Decimal(100),
    shopifyOrderId: null,
    shopifySyncStatus: "PENDING",
    codLead: { name: "Maria", phone: "+57 300", address: "Calle 1", city: "Medellín", state: "Antioquia", country: "CO" },
    items: [{ titleSnapshot: "Produto X", quantity: 1, unitPrice: new Prisma.Decimal(100), lineTotal: new Prisma.Decimal(100) }],
    shopifyStore: { id: "store_1", shopDomain: "loja.myshopify.com", status: "CONNECTED" },
    ...overrides,
  };
  orders.push(order);
  return order;
}

function run() {
  return processShopifyOrderCreateJob({ orderId: ORDER_ID });
}

beforeEach(() => {
  orders = [];
  syncEnabled = true;
  logAuditMock.mockClear();
  getDecryptedAccessTokenMock.mockClear();
  getDecryptedAccessTokenMock.mockResolvedValue("shpat_token");
  createShopifyOrderMock.mockReset();
  createShopifyOrderMock.mockResolvedValue({ outcome: "created", result: shopifyRef });
  findShopifyOrdersBySourceIdentifierMock.mockReset();
  findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([]);
});

describe("classifyShopifyFailure", () => {
  it("throttle é seguro (Shopify recusa antes de executar a mutação)", () => {
    expect(classifyShopifyFailure(new ShopifyThrottledError())).toBe("safe");
  });

  it("4xx é seguro (request rejeitada, nada criado)", () => {
    expect(classifyShopifyFailure(new ShopifyApiError("400", { status: 400 }))).toBe("safe");
  });

  it("timeout é ambíguo (a mutação pode ter sido executada)", () => {
    expect(classifyShopifyFailure(new ShopifyTimeoutError())).toBe("ambiguous");
  });

  it("5xx é ambíguo (pode ter falhado depois de aplicar)", () => {
    expect(classifyShopifyFailure(new ShopifyApiError("502", { status: 502 }))).toBe("ambiguous");
  });

  it("erro de transporte/desconhecido é ambíguo por default conservador", () => {
    expect(classifyShopifyFailure(new TypeError("fetch failed"))).toBe("ambiguous");
  });
});

describe("processShopifyOrderCreateJob — criação e curto-circuito", () => {
  it("idempotente: Order já com shopifyOrderId nunca chama a Shopify de novo", async () => {
    seedOrder({ shopifyOrderId: "gid://shopify/Order/1", shopifySyncStatus: "SYNCING" });

    await run();

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(findShopifyOrdersBySourceIdentifierMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("com SHOPIFY_ORDER_SYNC_ENABLED=false nunca chama a Shopify", async () => {
    syncEnabled = false;
    seedOrder();

    await run();

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("PENDING");
  });

  it("primeira tentativa (PENDING) cria direto, sem gastar consulta de reconciliação", async () => {
    seedOrder({ shopifySyncStatus: "PENDING" });

    await run();

    expect(findShopifyOrdersBySourceIdentifierMock).not.toHaveBeenCalled();
    expect(createShopifyOrderMock).toHaveBeenCalledTimes(1);
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/1");
  });

  it("envia o sourceIdentifier derivado do Order local (sem PII)", async () => {
    seedOrder();

    await run();

    const input = createShopifyOrderMock.mock.calls[0][2];
    expect(input.sourceIdentifier).toBe(SOURCE_IDENTIFIER);
    expect(input.sourceIdentifier).not.toMatch(/Maria|300|Calle|Medell/);
  });

  it("envia sempre quantity:1 e unitPrice=lineTotal exato — quantidade real só no título", async () => {
    seedOrder({
      total: new Prisma.Decimal(179800),
      items: [
        {
          titleSnapshot: "Produto X",
          quantity: 2,
          unitPrice: new Prisma.Decimal(89900),
          lineTotal: new Prisma.Decimal(179800),
        },
      ],
    });

    await run();

    const input = createShopifyOrderMock.mock.calls[0][2];
    expect(input.lineItems).toEqual([{ title: "Produto X (2x)", quantity: 1, unitPrice: "179800.00" }]);
  });

  it("FIXED_TOTAL com total não divisível por quantity ainda soma exato — sem quantity fracionado", async () => {
    // 149.900 / 3 não é exato em centavos; o worker nunca usa unitPrice ×
    // quantity, então isso nunca gera divergência.
    seedOrder({
      total: new Prisma.Decimal(149900),
      items: [
        {
          titleSnapshot: "Produto X",
          quantity: 3,
          unitPrice: new Prisma.Decimal(49966.67),
          lineTotal: new Prisma.Decimal(149900),
        },
      ],
    });

    await run();

    const input = createShopifyOrderMock.mock.calls[0][2];
    expect(input.lineItems).toEqual([{ title: "Produto X (3x)", quantity: 1, unitPrice: "149900.00" }]);
  });

  it("falha fechado quando os line items não somam o total do Order (quote não representável)", async () => {
    seedOrder({
      total: new Prisma.Decimal(150), // desconto/frete hipotético: divergente de 1 × 100
      items: [{ titleSnapshot: "Produto X", quantity: 1, unitPrice: new Prisma.Decimal(100), lineTotal: new Prisma.Decimal(100) }],
    });

    await expect(run()).rejects.toThrow(NonRetryableJobError);
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("FAILED");
  });
});

describe("processShopifyOrderCreateJob — reconciliação por source_identifier", () => {
  it("retry após falha ambígua consulta por source_identifier ANTES de criar", async () => {
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([shopifyRef]);

    await run();

    expect(findShopifyOrdersBySourceIdentifierMock).toHaveBeenCalledWith(
      "loja.myshopify.com",
      "shpat_token",
      SOURCE_IDENTIFIER
    );
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
  });

  it("pedido já existente é reconciliado (id, name, SYNCED) sem segundo orderCreate", async () => {
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([shopifyRef]);

    await run();

    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/1");
    expect(orders[0].shopifyOrderName).toBe("#1001");
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
  });

  it("nenhum resultado libera o retry normal (cria conforme a política existente)", async () => {
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([]);

    await run();

    expect(createShopifyOrderMock).toHaveBeenCalledTimes(1);
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("mais de um resultado falha fechado: MANUAL_REVIEW, nunca cria outro pedido", async () => {
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([
      shopifyRef,
      { shopifyOrderId: "gid://shopify/Order/2", shopifyOrderName: "#1002", shopifyCreatedAt: "2026-01-01T00:01:00Z" },
    ]);

    await expect(run()).rejects.toThrow(NonRetryableJobError);

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("MANUAL_REVIEW");
    expect(orders[0].shopifyOrderId).toBeNull();
  });

  it("o log operacional da duplicata não carrega PII", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([
      shopifyRef,
      { shopifyOrderId: "gid://shopify/Order/2", shopifyOrderName: "#1002", shopifyCreatedAt: "2026-01-01T00:01:00Z" },
    ]);

    await expect(run()).rejects.toThrow(NonRetryableJobError);

    const logged = JSON.stringify(consoleSpy.mock.calls);
    expect(logged).toMatch(/duplicate_source_identifier/);
    expect(logged).not.toMatch(/Maria|Calle 1|Medell|\+57/);
    consoleSpy.mockRestore();
  });

  it("Order em MANUAL_REVIEW nunca tenta criar de novo por conta própria", async () => {
    seedOrder({ shopifySyncStatus: "MANUAL_REVIEW" });

    await expect(run()).rejects.toThrow(NonRetryableJobError);

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(findShopifyOrdersBySourceIdentifierMock).not.toHaveBeenCalled();
  });

  it("a reconciliação não usa tag como identidade — só o sourceIdentifier", async () => {
    seedOrder({ shopifySyncStatus: "SYNCING" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([shopifyRef]);

    await run();

    const [, , identifier] = findShopifyOrdersBySourceIdentifierMock.mock.calls[0] as unknown as string[];
    expect(identifier).toBe(SOURCE_IDENTIFIER);
    expect(identifier).not.toMatch(/^internal_order_/);
  });
});

describe("processShopifyOrderCreateJob — race: criado na Shopify, resposta perdida", () => {
  it("timeout após criação remota deixa o estado ambíguo (SYNCING) e a próxima tentativa reconcilia", async () => {
    seedOrder({ shopifySyncStatus: "PENDING" });
    // Tentativa 1: a Shopify criou o pedido, mas a resposta se perdeu.
    createShopifyOrderMock.mockRejectedValueOnce(new ShopifyTimeoutError());

    await expect(run()).rejects.toThrow(ShopifyTimeoutError);
    // Marcador durável preservado: obriga reconciliação na próxima rodada.
    expect(orders[0].shopifySyncStatus).toBe("SYNCING");

    // Tentativa 2 (job recuperado por outro worker): encontra o pedido.
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([shopifyRef]);
    createShopifyOrderMock.mockClear();

    await run();

    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/1");
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("falha segura (throttle) volta para PENDING — próxima tentativa não gasta consulta", async () => {
    seedOrder({ shopifySyncStatus: "PENDING" });
    createShopifyOrderMock.mockRejectedValueOnce(new ShopifyThrottledError());

    await expect(run()).rejects.toThrow(ShopifyThrottledError);
    expect(orders[0].shopifySyncStatus).toBe("PENDING");

    createShopifyOrderMock.mockResolvedValue({ outcome: "created", result: shopifyRef });
    await run();

    expect(findShopifyOrdersBySourceIdentifierMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("SYNCED");
  });

  it("FAILED (retries esgotados) também reconcilia antes de qualquer nova criação", async () => {
    seedOrder({ shopifySyncStatus: "FAILED" });
    findShopifyOrdersBySourceIdentifierMock.mockResolvedValue([shopifyRef]);

    await run();

    expect(findShopifyOrdersBySourceIdentifierMock).toHaveBeenCalledTimes(1);
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
  });
});

describe("processShopifyOrderCreateJob — falhas terminais", () => {
  it("userErrors: FAILED e não-retryable (retentar o mesmo payload nunca funciona)", async () => {
    seedOrder();
    createShopifyOrderMock.mockResolvedValue({ outcome: "userErrors", errors: ["Endereço inválido"] });

    await expect(run()).rejects.toThrow(NonRetryableJobError);
    expect(orders[0].shopifySyncStatus).toBe("FAILED");
  });

  it("401: REAUTH_REQUIRED no Order e na loja, não-retryable", async () => {
    seedOrder();
    createShopifyOrderMock.mockRejectedValue(new ShopifyAuthError());

    await expect(run()).rejects.toThrow(NonRetryableJobError);
    expect(orders[0].shopifySyncStatus).toBe("REAUTH_REQUIRED");
    expect(orders[0].shopifyStore.status).toBe("REAUTH_REQUIRED");
  });

  it("loja desconectada: falha não-retryable sem tocar a rede", async () => {
    seedOrder({ shopifyStore: { id: "store_1", shopDomain: "loja.myshopify.com", status: "DISCONNECTED" } });

    await expect(run()).rejects.toThrow(NonRetryableJobError);
    expect(createShopifyOrderMock).not.toHaveBeenCalled();
    expect(findShopifyOrdersBySourceIdentifierMock).not.toHaveBeenCalled();
    expect(orders[0].shopifySyncStatus).toBe("FAILED");
  });
});
