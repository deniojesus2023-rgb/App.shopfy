import { describe, expect, it, vi } from "vitest";

const softDeleteMock = vi.fn(async () => undefined);
vi.mock("../service", () => ({ softDeleteProductByShopifyId: softDeleteMock }));

const { processProductDeleteJob } = await import("./product-delete");

describe("processProductDeleteJob", () => {
  it("delega o soft delete para o service com os identificadores corretos", async () => {
    await processProductDeleteJob({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      shopifyProductId: "gid://shopify/Product/123",
    });

    expect(softDeleteMock).toHaveBeenCalledWith("store_1", "gid://shopify/Product/123");
  });
});
