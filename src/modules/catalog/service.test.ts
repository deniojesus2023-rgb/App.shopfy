import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeProduct {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  shopifyProductId: string;
  title: string;
  lastSeenSyncRunId: string | null;
  deletedAt: Date | null;
  price?: unknown;
}

interface FakeVariant {
  id: string;
  workspaceId: string;
  productId: string;
  shopifyStoreId: string;
  shopifyVariantId: string;
  deletedAt: Date | null;
  price?: unknown;
}

let products: FakeProduct[] = [];
let variants: FakeVariant[] = [];
let nextId = 1;

function findProduct(shopifyStoreId: string, shopifyProductId: string) {
  return products.find(
    (p) => p.shopifyStoreId === shopifyStoreId && p.shopifyProductId === shopifyProductId
  );
}

function findVariant(shopifyStoreId: string, shopifyVariantId: string) {
  return variants.find(
    (v) => v.shopifyStoreId === shopifyStoreId && v.shopifyVariantId === shopifyVariantId
  );
}

const fakeTx = {
  product: {
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        where: unknown;
        create: Omit<FakeProduct, "id">;
        update: Partial<FakeProduct>;
      }) => {
        const existing = findProduct(create.shopifyStoreId, create.shopifyProductId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: FakeProduct = { id: `prod_${nextId++}`, ...create };
        products.push(row);
        return row;
      }
    ),
  },
  productVariant: {
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { productId: string; shopifyVariantId?: { notIn: string[] }; deletedAt: null };
        data: { deletedAt: Date };
      }) => {
        const affected = variants.filter(
          (v) =>
            v.productId === where.productId &&
            v.deletedAt === null &&
            (!where.shopifyVariantId || !where.shopifyVariantId.notIn.includes(v.shopifyVariantId))
        );
        affected.forEach((v) => (v.deletedAt = data.deletedAt));
        return { count: affected.length };
      }
    ),
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        where: unknown;
        create: Omit<FakeVariant, "id">;
        update: Partial<FakeVariant>;
      }) => {
        const existing = findVariant(create.shopifyStoreId, create.shopifyVariantId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: FakeVariant = { id: `var_${nextId++}`, ...create };
        variants.push(row);
        return row;
      }
    ),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return arg(fakeTx);
      return Promise.all(arg as Promise<unknown>[]);
    }),
    product: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id?: string;
            shopifyStoreId_shopifyProductId?: { shopifyStoreId: string; shopifyProductId: string };
          };
        }) => {
          if (where.id) return products.find((p) => p.id === where.id) ?? null;
          if (where.shopifyStoreId_shopifyProductId) {
            const { shopifyStoreId, shopifyProductId } = where.shopifyStoreId_shopifyProductId;
            return findProduct(shopifyStoreId, shopifyProductId) ?? null;
          }
          return null;
        }
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { shopifyStoreId: string; deletedAt: null; lastSeenSyncRunId?: { not: string } };
        }) => {
          return products.filter(
            (p) =>
              p.shopifyStoreId === where.shopifyStoreId &&
              p.deletedAt === null &&
              (!where.lastSeenSyncRunId || p.lastSeenSyncRunId !== where.lastSeenSyncRunId.not)
          );
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeProduct> }) => {
        const row = products.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<FakeProduct> }) => {
          const affected = products.filter((p) => where.id.in.includes(p.id));
          affected.forEach((p) => Object.assign(p, data));
          return { count: affected.length };
        }
      ),
    },
    productVariant: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { productId: string | { in: string[] }; deletedAt: null };
          data: Partial<FakeVariant>;
        }) => {
          const ids = typeof where.productId === "string" ? [where.productId] : where.productId.in;
          const affected = variants.filter((v) => ids.includes(v.productId) && v.deletedAt === null);
          affected.forEach((v) => Object.assign(v, data));
          return { count: affected.length };
        }
      ),
    },
  },
}));

const { upsertProductWithVariants, reconcileProductsNotSeenInRun, softDeleteProductByShopifyId } =
  await import("./service");

beforeEach(() => {
  products = [];
  variants = [];
  nextId = 1;
});

describe("upsertProductWithVariants (idempotência)", () => {
  it("cria produto e variantes na primeira chamada", async () => {
    const result = await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [baseVariant("v1")],
    });

    expect(products).toHaveLength(1);
    expect(variants).toHaveLength(1);
    expect(result.variantCount).toBe(1);
  });

  it("chamar duas vezes com o mesmo produto não duplica — atualiza a linha existente", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct({ title: "Título Original" }),
      variants: [baseVariant("v1", { price: "10.00" })],
    });

    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct({ title: "Título Atualizado" }),
      variants: [baseVariant("v1", { price: "20.00" })],
    });

    expect(products).toHaveLength(1);
    expect(variants).toHaveLength(1);
    expect(products[0].title).toBe("Título Atualizado");
    expect(String(variants[0].price)).toBe("20");
  });

  it("um full sync executado duas vezes não duplica produtos nem variantes", async () => {
    const page = [
      { product: baseProduct({ shopifyProductId: "p1" }), variants: [baseVariant("p1v1")] },
      { product: baseProduct({ shopifyProductId: "p2" }), variants: [baseVariant("p2v1"), baseVariant("p2v2")] },
    ];

    for (let run = 0; run < 2; run++) {
      for (const item of page) {
        await upsertProductWithVariants({
          workspaceId: "ws_1",
          shopifyStoreId: "store_1",
          product: item.product,
          variants: item.variants,
        });
      }
    }

    expect(products).toHaveLength(2);
    expect(variants).toHaveLength(3);
  });

  it("isola produtos por loja: mesmo shopifyProductId em lojas diferentes não colide", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_A",
      product: baseProduct({ shopifyProductId: "gid://shopify/Product/1" }),
      variants: [],
    });
    await upsertProductWithVariants({
      workspaceId: "ws_2",
      shopifyStoreId: "store_B",
      product: baseProduct({ shopifyProductId: "gid://shopify/Product/1" }),
      variants: [],
    });

    expect(products).toHaveLength(2);
    expect(new Set(products.map((p) => p.shopifyStoreId))).toEqual(new Set(["store_A", "store_B"]));
  });

  it("variante removida do produto (não veio mais na página) é soft-deletada", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [baseVariant("v1"), baseVariant("v2")],
    });

    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [baseVariant("v1")],
    });

    const v2 = variants.find((v) => v.shopifyVariantId === "v2")!;
    expect(v2.deletedAt).not.toBeNull();
  });

  it("produto que passa a não ter nenhuma variante remove todas as locais", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [baseVariant("v1"), baseVariant("v2")],
    });

    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [],
    });

    expect(variants.every((v) => v.deletedAt !== null)).toBe(true);
  });
});

describe("reconcileProductsNotSeenInRun", () => {
  it("soft-deleta produtos cujo marcador não é do run atual", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct({ shopifyProductId: "seen" }),
      variants: [],
      syncRunId: "run_current",
    });
    // Produto "órfão": ficou de um run anterior e não apareceu no atual.
    products.push({
      id: "prod_orphan",
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      shopifyProductId: "orphan",
      title: "Órfão",
      lastSeenSyncRunId: "run_previous",
      deletedAt: null,
    });

    const count = await reconcileProductsNotSeenInRun({
      shopifyStoreId: "store_1",
      syncRunId: "run_current",
    });

    expect(count).toBe(1);
    expect(products.find((p) => p.id === "prod_orphan")!.deletedAt).not.toBeNull();
    expect(products.find((p) => p.shopifyProductId === "seen")!.deletedAt).toBeNull();
  });
});

describe("softDeleteProductByShopifyId", () => {
  it("soft-deleta o produto e suas variantes, preservando o histórico (linha continua existindo)", async () => {
    await upsertProductWithVariants({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      product: baseProduct(),
      variants: [baseVariant("v1")],
    });

    await softDeleteProductByShopifyId("store_1", "gid://shopify/Product/1");

    expect(products).toHaveLength(1);
    expect(products[0].deletedAt).not.toBeNull();
    expect(variants[0].deletedAt).not.toBeNull();
  });
});

function baseProduct(overrides: Partial<FakeProduct> = {}) {
  return {
    shopifyProductId: "gid://shopify/Product/1",
    title: "Produto",
    handle: "produto",
    description: null,
    descriptionHtml: null,
    vendor: null,
    productType: null,
    status: "ACTIVE" as const,
    featuredImageUrl: null,
    shopifyCreatedAt: new Date("2026-01-01"),
    shopifyUpdatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function baseVariant(shopifyVariantId: string, overrides: Record<string, unknown> = {}) {
  return {
    shopifyVariantId,
    title: "Default",
    sku: null,
    barcode: null,
    price: "10.00",
    compareAtPrice: null,
    inventoryQuantity: null,
    availableForSale: true,
    position: 0,
    imageUrl: null,
    shopifyCreatedAt: new Date("2026-01-01"),
    shopifyUpdatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}
