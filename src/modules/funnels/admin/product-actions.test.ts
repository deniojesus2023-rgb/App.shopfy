import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeStore {
  id: string;
  workspaceId: string;
}
interface FakeProduct {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  title: string;
  featuredImageUrl: string | null;
}
interface FakeFunnel {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
}
interface FakeFunnelProduct {
  id: string;
  workspaceId: string;
  funnelId: string;
  productId: string;
  role: string;
}

let stores: FakeStore[] = [];
let products: FakeProduct[] = [];
let funnels: FakeFunnel[] = [];
let funnelProducts: FakeFunnelProduct[] = [];
let nextId = 1;

const listProductsMock = vi.fn(async () => ({ items: [], nextCursor: null }));

vi.mock("@/modules/catalog/service", () => ({ listProducts: listProductsMock }));
vi.mock("@/modules/audit/service", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyStore: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) =>
        stores.find((s) => s.id === where.id && s.workspaceId === where.workspaceId) ?? null
      ),
    },
    product: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; workspaceId: string; shopifyStoreId: string } }) =>
          products.find(
            (p) => p.id === where.id && p.workspaceId === where.workspaceId && p.shopifyStoreId === where.shopifyStoreId
          ) ?? null
      ),
    },
    funnel: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) =>
        funnels.find((f) => f.id === where.id && f.workspaceId === where.workspaceId) ?? null
      ),
    },
    funnelProduct: {
      deleteMany: vi.fn(async ({ where }: { where: { funnelId: string; role: string } }) => {
        const before = funnelProducts.length;
        funnelProducts = funnelProducts.filter((fp) => !(fp.funnelId === where.funnelId && fp.role === where.role));
        return { count: before - funnelProducts.length };
      }),
      create: vi.fn(async ({ data }: { data: Omit<FakeFunnelProduct, "id"> }) => {
        const row: FakeFunnelProduct = { id: `fp_${nextId++}`, ...data };
        funnelProducts.push(row);
        return row;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") throw new Error("unexpected function transaction");
      return Promise.all(arg as Promise<unknown>[]);
    }),
  },
}));

// requireWorkspacePermission já é testado em outros módulos; aqui simulamos
// diretamente o contexto de tenant resolvido, focando no comportamento
// específico destas actions (isolamento, cross-store).
vi.mock("@/modules/workspaces/tenant", () => ({
  requireWorkspacePermission: vi.fn(async () => ({
    user: { id: "user_1" },
    workspace: { id: "cws00000000000000000000001", slug: "acme" },
    role: "ADMIN",
  })),
}));

const { searchStoreProductsAction, setUpsellProductAction } = await import("./product-actions");

beforeEach(() => {
  stores = [{ id: "cstore00000000000000000001", workspaceId: "cws00000000000000000000001" }];
  products = [
    { id: "cprod0000000000000000000001", workspaceId: "cws00000000000000000000001", shopifyStoreId: "cstore00000000000000000001", title: "Produto A", featuredImageUrl: null },
  ];
  funnels = [{ id: "cfunnel000000000000000001", workspaceId: "cws00000000000000000000001", shopifyStoreId: "cstore00000000000000000001" }];
  funnelProducts = [];
  nextId = 1;
  listProductsMock.mockClear();
});

describe("searchStoreProductsAction (tenant isolation)", () => {
  it("busca produtos quando a loja pertence ao workspace", async () => {
    const result = await searchStoreProductsAction("acme", { shopifyStoreId: "cstore00000000000000000001" });
    expect(result.ok).toBe(true);
    expect(listProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "cws00000000000000000000001", shopifyStoreId: "cstore00000000000000000001" })
    );
  });

  it("rejeita loja que não pertence ao workspace (nunca vaza catálogo de outro tenant)", async () => {
    const result = await searchStoreProductsAction("acme", { shopifyStoreId: "cstore00000000000000000099" });
    expect(result.ok).toBe(false);
    expect(listProductsMock).not.toHaveBeenCalled();
  });
});

describe("setUpsellProductAction (cross-store rejection)", () => {
  it("associa um produto da mesma loja como UPSELL", async () => {
    const result = await setUpsellProductAction("acme", { funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000001" });
    expect(result.ok).toBe(true);
    expect(funnelProducts).toEqual([
      expect.objectContaining({ funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000001", role: "UPSELL" }),
    ]);
  });

  it("rejeita produto de uma loja Shopify diferente do funil", async () => {
    stores.push({ id: "cstore00000000000000000002", workspaceId: "cws00000000000000000000001" });
    products.push({ id: "cprod0000000000000000000003", workspaceId: "cws00000000000000000000001", shopifyStoreId: "cstore00000000000000000002", title: "X", featuredImageUrl: null });

    const result = await setUpsellProductAction("acme", { funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000003" });
    expect(result.ok).toBe(false);
    expect(funnelProducts).toHaveLength(0);
  });

  it("rejeita produto de outro workspace", async () => {
    products.push({ id: "cprod0000000000000000000004", workspaceId: "cws00000000000000000000002", shopifyStoreId: "cstore00000000000000000001", title: "X", featuredImageUrl: null });

    const result = await setUpsellProductAction("acme", { funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000004" });
    expect(result.ok).toBe(false);
    expect(funnelProducts).toHaveLength(0);
  });

  it("substitui (não acumula) o UPSELL anterior", async () => {
    products.push({ id: "cprod0000000000000000000002", workspaceId: "cws00000000000000000000001", shopifyStoreId: "cstore00000000000000000001", title: "Produto B", featuredImageUrl: null });

    await setUpsellProductAction("acme", { funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000001" });
    await setUpsellProductAction("acme", { funnelId: "cfunnel000000000000000001", productId: "cprod0000000000000000000002" });

    expect(funnelProducts).toHaveLength(1);
    expect(funnelProducts[0].productId).toBe("cprod0000000000000000000002");
  });
});
