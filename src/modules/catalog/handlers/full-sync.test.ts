import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeStore {
  id: string;
  workspaceId: string;
  shopDomain: string;
  status: string;
  lastSyncAt: Date | null;
}

let store: FakeStore;

const upsertMock = vi.fn(
  async (params: {
    workspaceId: string;
    shopifyStoreId: string;
    product: { shopifyProductId: string };
    variants: unknown[];
    syncRunId?: string;
  }) => {
    void params;
    return { productId: "p1", variantCount: 2 };
  }
);
const reconcileMock = vi.fn(async () => 1);
const markRunningMock = vi.fn(async () => undefined);
const incrementMock = vi.fn(async () => undefined);
const completeMock = vi.fn(async () => undefined);
const failMock = vi.fn(async () => undefined);
const enqueueMock = vi.fn(async () => ({}) as never);
const ensureWebhooksMock = vi.fn(async () => []);
const getTokenMock = vi.fn(async () => "shpat_fake_token");

let requestWithMetaImpl: () => Promise<unknown>;

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyStore: {
      findFirst: vi.fn(async () => store),
      update: vi.fn(async ({ data }: { data: Partial<FakeStore> }) => {
        Object.assign(store, data);
        return store;
      }),
    },
  },
}));

vi.mock("@/modules/queue/service", () => ({ enqueueJob: enqueueMock }));
vi.mock("@/modules/shopify/stores/service", () => ({ getDecryptedAccessToken: getTokenMock }));
vi.mock("@/modules/shopify/webhooks/register", () => ({ ensureRequiredWebhooks: ensureWebhooksMock }));
vi.mock("@/modules/shopify/client", async () => {
  const actual = await vi.importActual<typeof import("@/modules/shopify/client")>(
    "@/modules/shopify/client"
  );
  return {
    ...actual,
    createShopifyGraphqlClient: () => ({
      requestWithMeta: () => requestWithMetaImpl(),
    }),
  };
});
vi.mock("../service", () => ({
  upsertProductWithVariants: upsertMock,
  reconcileProductsNotSeenInRun: reconcileMock,
}));
vi.mock("../sync-run", () => ({
  markSyncRunRunning: markRunningMock,
  incrementSyncRunCounters: incrementMock,
  completeSyncRun: completeMock,
  failSyncRun: failMock,
}));

const { processFullCatalogSyncJob } = await import("./full-sync");

function productEdge(id: string) {
  return {
    node: {
      id,
      title: `Produto ${id}`,
      handle: id,
      description: null,
      descriptionHtml: null,
      vendor: null,
      productType: null,
      status: "ACTIVE" as const,
      featuredImage: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      variants: { edges: [{ node: variantNode("v1") }, { node: variantNode("v2") }] },
    },
  };
}

function variantNode(id: string) {
  return {
    id,
    title: "Default",
    sku: null,
    barcode: null,
    price: "10.00",
    compareAtPrice: null,
    inventoryQuantity: null,
    availableForSale: true,
    image: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  store = { id: "store_1", workspaceId: "ws_1", shopDomain: "loja.myshopify.com", status: "CONNECTED", lastSyncAt: null };
  vi.clearAllMocks();
});

const basePayload = { workspaceId: "ws_1", shopifyStoreId: "store_1", syncRunId: "run_1" };

describe("processFullCatalogSyncJob — paginação", () => {
  it("página com hasNextPage enfileira continuação com o cursor, sem reconciliar ainda", async () => {
    requestWithMetaImpl = async () => ({
      data: {
        products: {
          pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
          edges: [productEdge("gid://shopify/Product/1")],
        },
      },
      throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 900, restoreRate: 50 },
    });

    await processFullCatalogSyncJob(basePayload);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(incrementMock).toHaveBeenCalledWith("run_1", { products: 1, variants: 2 });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SHOPIFY_FULL_CATALOG_SYNC",
        payload: expect.objectContaining({ ...basePayload, cursor: "cursor-2" }),
      })
    );
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("última página (hasNextPage: false) reconcilia e completa o run", async () => {
    requestWithMetaImpl = async () => ({
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [productEdge("gid://shopify/Product/2")],
        },
      },
      throttleStatus: null,
    });

    await processFullCatalogSyncJob({ ...basePayload, cursor: "cursor-2" });

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(reconcileMock).toHaveBeenCalledWith({ shopifyStoreId: "store_1", syncRunId: "run_1" });
    expect(completeMock).toHaveBeenCalledWith("run_1");
    expect(store.lastSyncAt).not.toBeNull();
  });

  it("primeira página (sem cursor) marca RUNNING e garante webhooks; continuação não repete", async () => {
    requestWithMetaImpl = async () => ({
      data: { products: { pageInfo: { hasNextPage: true, endCursor: "c2" }, edges: [] } },
      throttleStatus: null,
    });

    await processFullCatalogSyncJob(basePayload);
    expect(markRunningMock).toHaveBeenCalledWith("run_1");
    expect(ensureWebhooksMock).toHaveBeenCalledTimes(1);

    markRunningMock.mockClear();
    ensureWebhooksMock.mockClear();

    await processFullCatalogSyncJob({ ...basePayload, cursor: "c2" });
    expect(markRunningMock).not.toHaveBeenCalled();
    expect(ensureWebhooksMock).not.toHaveBeenCalled();
  });

  it("loja desconectada aborta sem tentar chamar a Shopify (falha não-retentável)", async () => {
    store.status = "DISCONNECTED";
    requestWithMetaImpl = async () => {
      throw new Error("não deveria chamar a Shopify");
    };

    await expect(processFullCatalogSyncJob(basePayload)).rejects.toThrow();
    expect(failMock).toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("full sync roda duas vezes de ponta a ponta sem duplicar upserts por produto", async () => {
    requestWithMetaImpl = async () => ({
      data: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [productEdge("gid://shopify/Product/1")],
        },
      },
      throttleStatus: null,
    });

    await processFullCatalogSyncJob(basePayload);
    await processFullCatalogSyncJob(basePayload);

    // upsertProductWithVariants é chamado uma vez por produto por execução;
    // a idempotência real (não duplicar linha) é responsabilidade do
    // service (coberta em catalog/service.test.ts) — aqui garantimos que a
    // orquestração chama o upsert com os mesmos identificadores nas duas
    // execuções, o que é o que garante o resultado idempotente.
    expect(upsertMock).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = upsertMock.mock.calls;
    expect(firstCall[0].product.shopifyProductId).toBe(secondCall[0].product.shopifyProductId);
  });
});
