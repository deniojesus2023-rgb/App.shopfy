import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeTemplate {
  key: string;
  configSchemaVersion: number;
  defaultConfig: unknown;
  isActive: boolean;
}
interface FakeStore {
  id: string;
  workspaceId: string;
}
interface FakeProduct {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
}
interface FakeFunnel {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  name: string;
  slug: string;
  status: string;
  publishedVersionId: string | null;
  createdByUserId: string;
  archivedAt: Date | null;
}
interface FakeVersion {
  id: string;
  workspaceId: string;
  funnelId: string;
  versionNumber: number;
  configSchemaVersion: number;
  config: unknown;
  status: string;
  revision: number;
  createdByUserId: string;
  publishedAt: Date | null;
}
interface FakeFunnelProduct {
  id: string;
  workspaceId: string;
  funnelId: string;
  productId: string;
  role: string;
}

let templates: FakeTemplate[] = [];
let stores: FakeStore[] = [];
let products: FakeProduct[] = [];
let funnels: FakeFunnel[] = [];
let versions: FakeVersion[] = [];
let funnelProducts: FakeFunnelProduct[] = [];
let nextId = 1;

function id(prefix: string) {
  return `${prefix}_${nextId++}`;
}

const db = {
  funnelTemplate: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => templates.find((t) => t.key === where.key) ?? null),
  },
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
    findUnique: vi.fn(
      async ({ where }: { where: { workspaceId_slug?: { workspaceId: string; slug: string } } }) => {
        if (!where.workspaceId_slug) return null;
        const { workspaceId, slug } = where.workspaceId_slug;
        return funnels.find((f) => f.workspaceId === workspaceId && f.slug === slug) ?? null;
      }
    ),
    findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) => {
      const f = funnels.find((x) => x.id === where.id && x.workspaceId === where.workspaceId);
      if (!f) return null;
      return {
        ...f,
        publishedVersion: versions.find((v) => v.id === f.publishedVersionId) ?? null,
        versions: versions.filter((v) => v.funnelId === f.id).sort((a, b) => b.versionNumber - a.versionNumber),
      };
    }),
    create: vi.fn(async ({ data }: { data: Omit<FakeFunnel, "id" | "publishedVersionId" | "archivedAt"> }) => {
      const row: FakeFunnel = { id: id("funnel"), publishedVersionId: null, archivedAt: null, ...data };
      funnels.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeFunnel> }) => {
      const row = funnels.find((f) => f.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  },
  funnelVersion: {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { funnelId: string; status?: string; id?: string; workspaceId?: string };
      }) =>
        versions.find(
          (v) =>
            v.funnelId === where.funnelId &&
            (!where.status || v.status === where.status) &&
            (!where.id || v.id === where.id) &&
            (!where.workspaceId || v.workspaceId === where.workspaceId)
        ) ?? null
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const v = versions.find((x) => x.id === where.id);
      if (!v) throw new Error("not found");
      return v;
    }),
    create: vi.fn(async ({ data }: { data: Omit<FakeVersion, "id" | "publishedAt"> }) => {
      const row: FakeVersion = { id: id("version"), publishedAt: null, ...data };
      versions.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeVersion> }) => {
      const row = versions.find((v) => v.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; revision: number; status: string };
        data: { config?: unknown; revision: { increment: number } };
      }) => {
        const row = versions.find(
          (v) => v.id === where.id && v.revision === where.revision && v.status === where.status
        );
        if (!row) return { count: 0 };
        if (data.config !== undefined) row.config = data.config;
        row.revision += data.revision.increment;
        return { count: 1 };
      }
    ),
  },
  funnelProduct: {
    create: vi.fn(async ({ data }: { data: Omit<FakeFunnelProduct, "id"> }) => {
      const row: FakeFunnelProduct = { id: id("fp"), ...data };
      funnelProducts.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where }: { where: { workspaceId: string; funnelId: string } }) =>
      funnelProducts
        .filter((fp) => fp.workspaceId === where.workspaceId && fp.funnelId === where.funnelId)
        .map((fp) => ({
          ...fp,
          product: products.find((p) => p.id === fp.productId)!,
        }))
    ),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return arg(db);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/modules/audit/service", () => ({ logAudit: vi.fn(async () => undefined) }));

const { createFunnel, getOrCreateDraftVersion, updateDraftConfig, publishFunnel, archiveFunnel } =
  await import("./service");

const fakeUser = { id: "user_1" } as never;

const validConfigForTemplate = {
  schemaVersion: 1,
  theme: {
    primaryColor: "#111827",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
    mutedColor: "#6B7280",
    borderRadius: "MEDIUM",
    fontFamily: "SYSTEM",
    buttonStyle: "SOLID",
  },
  steps: [
    {
      id: "product",
      type: "PRODUCT",
      enabled: true,
      order: 0,
      config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "Comprar" },
    },
    {
      id: "success",
      type: "SUCCESS",
      enabled: true,
      order: 1,
      config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
    },
  ],
  settings: {},
};

beforeEach(() => {
  templates = [{ key: "tpl-1", configSchemaVersion: 1, defaultConfig: validConfigForTemplate, isActive: true }];
  stores = [{ id: "store_1", workspaceId: "ws_1" }];
  products = [{ id: "prod_1", workspaceId: "ws_1", shopifyStoreId: "store_1" }];
  funnels = [];
  versions = [];
  funnelProducts = [];
  nextId = 1;
  vi.clearAllMocks();
});

describe("createFunnel", () => {
  it("cria Funnel + v1 DRAFT + FunnelProduct(PRIMARY) numa única operação", async () => {
    const funnel = await createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Meu Funil",
      user: fakeUser,
    });

    expect(funnels).toHaveLength(1);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].status).toBe("DRAFT");
    expect(funnelProducts).toEqual([
      expect.objectContaining({ funnelId: funnel.id, productId: "prod_1", role: "PRIMARY" }),
    ]);
  });

  it("normaliza o nome em slug", async () => {
    const funnel = await createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Mini Aspiradora Pro!",
      user: fakeUser,
    });
    expect(funnel.slug).toBe("mini-aspiradora-pro");
  });

  it("slug é único por workspace: colisão gera erro", async () => {
    await createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Mesmo Nome",
      user: fakeUser,
    });

    await expect(
      createFunnel({
        workspaceId: "ws_1",
        shopifyStoreId: "store_1",
        productId: "prod_1",
        templateKey: "tpl-1",
        name: "Mesmo Nome",
        slug: "mesmo-nome",
        user: fakeUser,
      })
    ).rejects.toThrow();
  });

  it("rejeita produto de outro workspace", async () => {
    products.push({ id: "prod_other_ws", workspaceId: "ws_2", shopifyStoreId: "store_1" });

    await expect(
      createFunnel({
        workspaceId: "ws_1",
        shopifyStoreId: "store_1",
        productId: "prod_other_ws",
        templateKey: "tpl-1",
        name: "Funil X",
        user: fakeUser,
      })
    ).rejects.toThrow();
  });

  it("rejeita produto de loja Shopify diferente (mesmo workspace)", async () => {
    stores.push({ id: "store_2", workspaceId: "ws_1" });
    products.push({ id: "prod_other_store", workspaceId: "ws_1", shopifyStoreId: "store_2" });

    await expect(
      createFunnel({
        workspaceId: "ws_1",
        shopifyStoreId: "store_1", // funil na store_1
        productId: "prod_other_store", // produto pertence à store_2
        templateKey: "tpl-1",
        name: "Funil Y",
        user: fakeUser,
      })
    ).rejects.toThrow();
  });

  it("rejeita template inativo", async () => {
    templates[0].isActive = false;
    await expect(
      createFunnel({
        workspaceId: "ws_1",
        shopifyStoreId: "store_1",
        productId: "prod_1",
        templateKey: "tpl-1",
        name: "Funil Z",
        user: fakeUser,
      })
    ).rejects.toThrow();
  });
});

describe("updateDraftConfig — optimistic concurrency", () => {
  async function seedFunnelWithDraft() {
    return createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Funil Concorrência",
      user: fakeUser,
    });
  }

  it("salva com sucesso quando a revision informada bate com a atual", async () => {
    const funnel = await seedFunnelWithDraft();
    const draft = versions[0];

    const updated = await updateDraftConfig({
      workspaceId: "ws_1",
      funnelId: funnel.id,
      versionId: draft.id,
      expectedRevision: 0,
      config: validConfigForTemplate,
      user: fakeUser,
    });

    expect(updated.revision).toBe(1);
  });

  it("duas edições concorrentes: a segunda com revision desatualizada recebe conflito", async () => {
    const funnel = await seedFunnelWithDraft();
    const draft = versions[0];

    await updateDraftConfig({
      workspaceId: "ws_1",
      funnelId: funnel.id,
      versionId: draft.id,
      expectedRevision: 0,
      config: validConfigForTemplate,
      user: fakeUser,
    });

    // Segunda "aba" ainda pensa que a revision é 0.
    await expect(
      updateDraftConfig({
        workspaceId: "ws_1",
        funnelId: funnel.id,
        versionId: draft.id,
        expectedRevision: 0,
        config: validConfigForTemplate,
        user: fakeUser,
      })
    ).rejects.toThrow();
  });

  it("rejeita config estruturalmente inválido antes mesmo de checar revision", async () => {
    const funnel = await seedFunnelWithDraft();
    const draft = versions[0];

    await expect(
      updateDraftConfig({
        workspaceId: "ws_1",
        funnelId: funnel.id,
        versionId: draft.id,
        expectedRevision: 0,
        config: { schemaVersion: 1 },
        user: fakeUser,
      })
    ).rejects.toThrow();
  });
});

describe("publishFunnel", () => {
  async function seedFunnelWithDraft() {
    return createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Funil Publicação",
      user: fakeUser,
    });
  }

  it("publica a v1, marca o Funnel como PUBLISHED e seta publishedVersionId", async () => {
    const funnel = await seedFunnelWithDraft();

    await publishFunnel("ws_1", funnel.id, fakeUser);

    const updatedFunnel = funnels.find((f) => f.id === funnel.id)!;
    expect(updatedFunnel.status).toBe("PUBLISHED");
    expect(updatedFunnel.publishedVersionId).toBe(versions[0].id);
    expect(versions[0].status).toBe("PUBLISHED");
  });

  it("versão publicada não é mais alvo de update de config (imutável)", async () => {
    const funnel = await seedFunnelWithDraft();
    const draftId = versions[0].id;
    await publishFunnel("ws_1", funnel.id, fakeUser);

    await expect(
      updateDraftConfig({
        workspaceId: "ws_1",
        funnelId: funnel.id,
        versionId: draftId,
        expectedRevision: 0,
        config: validConfigForTemplate,
        user: fakeUser,
      })
    ).rejects.toThrow();
  });

  it("getOrCreateDraftVersion cria v2 DRAFT clonada depois de publicar", async () => {
    const funnel = await seedFunnelWithDraft();
    await publishFunnel("ws_1", funnel.id, fakeUser);

    const v2 = await getOrCreateDraftVersion("ws_1", funnel.id);

    expect(v2.versionNumber).toBe(2);
    expect(v2.status).toBe("DRAFT");
    expect(v2.config).toEqual(versions[0].config);
    // Clone profundo: não é a mesma referência do config publicado.
    expect(v2.config).not.toBe(versions[0].config);
  });

  it("publicar a v2 marca a v1 como SUPERSEDED", async () => {
    const funnel = await seedFunnelWithDraft();
    await publishFunnel("ws_1", funnel.id, fakeUser);
    const v1Id = versions[0].id;

    const v2 = await getOrCreateDraftVersion("ws_1", funnel.id);
    await publishFunnel("ws_1", funnel.id, fakeUser);

    expect(versions.find((v) => v.id === v1Id)!.status).toBe("SUPERSEDED");
    expect(versions.find((v) => v.id === v2.id)!.status).toBe("PUBLISHED");

    const updatedFunnel = funnels.find((f) => f.id === funnel.id)!;
    expect(updatedFunnel.publishedVersionId).toBe(v2.id);
  });

  it("getOrCreateDraftVersion retorna o draft existente sem criar um segundo (no máximo uma DRAFT ativa)", async () => {
    const funnel = await seedFunnelWithDraft();

    const first = await getOrCreateDraftVersion("ws_1", funnel.id);
    const second = await getOrCreateDraftVersion("ws_1", funnel.id);

    expect(first.id).toBe(second.id);
    expect(versions.filter((v) => v.status === "DRAFT")).toHaveLength(1);
  });

  it("rejeita publicação quando a validação semântica falha (sem SUCCESS)", async () => {
    const funnel = await seedFunnelWithDraft();
    versions[0].config = {
      ...validConfigForTemplate,
      steps: [validConfigForTemplate.steps[0]], // só PRODUCT, sem SUCCESS
    };

    await expect(publishFunnel("ws_1", funnel.id, fakeUser)).rejects.toThrow();
  });
});

describe("archiveFunnel", () => {
  it("marca o funil como ARCHIVED com archivedAt preenchido", async () => {
    const funnel = await createFunnel({
      workspaceId: "ws_1",
      shopifyStoreId: "store_1",
      productId: "prod_1",
      templateKey: "tpl-1",
      name: "Funil a arquivar",
      user: fakeUser,
    });

    const archived = await archiveFunnel("ws_1", funnel.id, fakeUser);
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).not.toBeNull();
  });
});
