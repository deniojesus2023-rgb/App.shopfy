import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeStore {
  id: string;
  workspaceId: string;
  shopDomain: string;
  status: string;
}

let store: FakeStore;
let productResponse: unknown;

const upsertMock = vi.fn(async () => ({ productId: "p1", variantCount: 1 }));
const softDeleteMock = vi.fn(async () => undefined);
const getTokenMock = vi.fn(async () => "shpat_fake_token");

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyStore: {
      findFirst: vi.fn(async () => store),
      update: vi.fn(async () => store),
    },
  },
}));
vi.mock("@/modules/shopify/stores/service", () => ({ getDecryptedAccessToken: getTokenMock }));
vi.mock("@/modules/shopify/client", async () => {
  const actual = await vi.importActual<typeof import("@/modules/shopify/client")>(
    "@/modules/shopify/client"
  );
  return {
    ...actual,
    createShopifyGraphqlClient: () => ({ request: async () => productResponse }),
  };
});
vi.mock("../service", () => ({
  upsertProductWithVariants: upsertMock,
  softDeleteProductByShopifyId: softDeleteMock,
}));

const { processProductSyncJob } = await import("./product-sync");

const payload = {
  workspaceId: "ws_1",
  shopifyStoreId: "store_1",
  shopifyProductId: "gid://shopify/Product/1",
};

beforeEach(() => {
  store = { id: "store_1", workspaceId: "ws_1", shopDomain: "loja.myshopify.com", status: "CONNECTED" };
  vi.clearAllMocks();
});

describe("processProductSyncJob", () => {
  it("busca o produto atual na Shopify (não confia no payload do webhook) e faz upsert", async () => {
    productResponse = {
      product: {
        id: "gid://shopify/Product/1",
        title: "Produto atualizado",
        handle: "produto",
        description: null,
        descriptionHtml: null,
        vendor: null,
        productType: null,
        status: "ACTIVE",
        featuredImage: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        variants: { edges: [] },
      },
    };

    await processProductSyncJob(payload);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws_1",
        shopifyStoreId: "store_1",
        product: expect.objectContaining({ title: "Produto atualizado" }),
      })
    );
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it("produto não existe mais na Shopify → soft delete em vez de erro", async () => {
    productResponse = { product: null };

    await processProductSyncJob(payload);

    expect(softDeleteMock).toHaveBeenCalledWith("store_1", "gid://shopify/Product/1");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
