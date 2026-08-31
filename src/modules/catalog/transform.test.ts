import { describe, expect, it } from "vitest";

import type { ShopifyProductNode, ShopifyVariantNode } from "./graphql";
import { transformProductNode, transformVariantNodes } from "./transform";

function makeVariantNode(overrides: Partial<ShopifyVariantNode> = {}): ShopifyVariantNode {
  return {
    id: "gid://shopify/ProductVariant/1",
    title: "Default",
    sku: "SKU-1",
    barcode: null,
    price: "99.90",
    compareAtPrice: null,
    inventoryQuantity: 10,
    availableForSale: true,
    image: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function makeProductNode(overrides: Partial<ShopifyProductNode> = {}): ShopifyProductNode {
  return {
    id: "gid://shopify/Product/1",
    title: "Camiseta",
    handle: "camiseta",
    description: "desc",
    descriptionHtml: "<p>desc</p>",
    vendor: "Vendor",
    productType: "Roupas",
    status: "ACTIVE",
    featuredImage: { url: "https://cdn.shopify.com/img.jpg" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    variants: { edges: [] },
    ...overrides,
  };
}

describe("transformProductNode", () => {
  it("mapeia todos os campos do produto", () => {
    const result = transformProductNode(makeProductNode());
    expect(result).toEqual({
      shopifyProductId: "gid://shopify/Product/1",
      title: "Camiseta",
      handle: "camiseta",
      description: "desc",
      descriptionHtml: "<p>desc</p>",
      vendor: "Vendor",
      productType: "Roupas",
      status: "ACTIVE",
      featuredImageUrl: "https://cdn.shopify.com/img.jpg",
      shopifyCreatedAt: new Date("2026-01-01T00:00:00Z"),
      shopifyUpdatedAt: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("usa null quando não há featuredImage", () => {
    const result = transformProductNode(makeProductNode({ featuredImage: null }));
    expect(result.featuredImageUrl).toBeNull();
  });
});

describe("transformVariantNodes", () => {
  it("deriva `position` do índice de retorno, não de um campo da API", () => {
    const edges = [
      { node: makeVariantNode({ id: "v1" }) },
      { node: makeVariantNode({ id: "v2" }) },
      { node: makeVariantNode({ id: "v3" }) },
    ];
    const result = transformVariantNodes(edges);
    expect(result.map((v) => v.position)).toEqual([0, 1, 2]);
    expect(result.map((v) => v.shopifyVariantId)).toEqual(["v1", "v2", "v3"]);
  });

  it("mapeia imagem da variante quando presente", () => {
    const edges = [{ node: makeVariantNode({ image: { url: "https://cdn.shopify.com/v.jpg" } }) }];
    expect(transformVariantNodes(edges)[0].imageUrl).toBe("https://cdn.shopify.com/v.jpg");
  });

  it("retorna array vazio para produto sem variantes", () => {
    expect(transformVariantNodes([])).toEqual([]);
  });
});
