import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeFunnel {
  id: string;
  name: string;
  slug: string;
  publicId: string;
  status: string;
  publishedVersionId: string | null;
}
interface FakeSnapshot {
  title: string;
  featuredImageUrl: string | null;
  unitPrice: { toNumber: () => number };
  compareAtPrice: { toNumber: () => number } | null;
}
interface FakeVersion {
  id: string;
  funnelId: string;
  versionNumber: number;
  configSchemaVersion: number;
  config: unknown;
  status: string;
  productSnapshot: FakeSnapshot | null;
}

let funnels: FakeFunnel[] = [];
let versions: FakeVersion[] = [];
let funnelProducts: Array<{ funnelId: string; role: string; product: { title: string; featuredImageUrl: string | null; variants: unknown[] } }> = [];

vi.mock("next/cache", () => ({
  // Bypassa o cache real do Next nos testes — testamos a lógica de
  // resolução, não o mecanismo de cache em si.
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    funnel: {
      findUnique: vi.fn(async ({ where }: { where: { publicId: string } }) =>
        funnels.find((f) => f.publicId === where.publicId) ?? null
      ),
    },
    funnelVersion: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        versions.find((v) => v.id === where.id) ?? null
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; funnelId: string } }) =>
        versions.find((v) => v.id === where.id && v.funnelId === where.funnelId) ?? null
      ),
    },
    funnelProduct: {
      findFirst: vi.fn(
        async ({ where }: { where: { funnelId: string; role: string } }) =>
          funnelProducts.find((fp) => fp.funnelId === where.funnelId && fp.role === where.role) ?? null
      ),
    },
  },
}));

const { resolvePublicFunnel, resolveFunnelVersionForPreview } = await import("./resolve");

function validConfig() {
  return {
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
        id: "success",
        type: "SUCCESS",
        enabled: true,
        order: 0,
        config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
      },
    ],
    settings: {},
  };
}

function fakeSnapshot(): FakeSnapshot {
  return {
    title: "Produto X",
    featuredImageUrl: "https://cdn.example.com/x.jpg",
    unitPrice: { toNumber: () => 19.9 },
    compareAtPrice: { toNumber: () => 29.9 },
  };
}

beforeEach(() => {
  funnels = [];
  versions = [];
  funnelProducts = [];
});

describe("resolvePublicFunnel", () => {
  it("resolve um funil PUBLISHED com versão PUBLISHED e snapshot", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "meu-funil",
      publicId: "pub_1",
      status: "PUBLISHED",
      publishedVersionId: "v1",
    });
    versions.push({
      id: "v1",
      funnelId: "f1",
      versionNumber: 2,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "PUBLISHED",
      productSnapshot: fakeSnapshot(),
    });

    const result = await resolvePublicFunnel("pub_1");
    expect(result).not.toBeNull();
    expect(result!.funnel.publicId).toBe("pub_1");
    expect(result!.version.versionNumber).toBe(2);
    expect(result!.snapshot.unitPrice).toBe(19.9);
    expect(result!.isPreview).toBe(false);
  });

  it("publicId inexistente resolve para null", async () => {
    expect(await resolvePublicFunnel("nao-existe")).toBeNull();
  });

  it("funil DRAFT nunca é resolvido publicamente", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "s",
      publicId: "pub_1",
      status: "DRAFT",
      publishedVersionId: null,
    });
    expect(await resolvePublicFunnel("pub_1")).toBeNull();
  });

  it("funil ARCHIVED nunca é resolvido publicamente (mesmo com publishedVersionId setado)", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "s",
      publicId: "pub_1",
      status: "ARCHIVED",
      publishedVersionId: "v1",
    });
    versions.push({
      id: "v1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "PUBLISHED",
      productSnapshot: fakeSnapshot(),
    });
    expect(await resolvePublicFunnel("pub_1")).toBeNull();
  });

  it("versão referenciada não está PUBLISHED (ex.: SUPERSEDED) nunca é servida", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "s",
      publicId: "pub_1",
      status: "PUBLISHED",
      publishedVersionId: "v1",
    });
    versions.push({
      id: "v1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "SUPERSEDED",
      productSnapshot: fakeSnapshot(),
    });
    expect(await resolvePublicFunnel("pub_1")).toBeNull();
  });

  it("config inválido falha fechada (retorna null, não lança)", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "s",
      publicId: "pub_1",
      status: "PUBLISHED",
      publishedVersionId: "v1",
    });
    versions.push({
      id: "v1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: { schemaVersion: 1 }, // sem steps/theme — inválido
      status: "PUBLISHED",
      productSnapshot: fakeSnapshot(),
    });
    await expect(resolvePublicFunnel("pub_1")).resolves.toBeNull();
  });

  it("sem FunnelProductSnapshot nunca é servido publicamente", async () => {
    funnels.push({
      id: "f1",
      name: "Funil",
      slug: "s",
      publicId: "pub_1",
      status: "PUBLISHED",
      publishedVersionId: "v1",
    });
    versions.push({
      id: "v1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "PUBLISHED",
      productSnapshot: null,
    });
    expect(await resolvePublicFunnel("pub_1")).toBeNull();
  });
});

describe("resolveFunnelVersionForPreview", () => {
  it("resolve uma versão DRAFT (nunca pública) via funnelId+versionId corretos", async () => {
    versions.push({
      id: "draft_1",
      funnelId: "f1",
      versionNumber: 3,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "DRAFT",
      productSnapshot: null,
    });
    funnelProducts.push({
      funnelId: "f1",
      role: "PRIMARY",
      product: {
        title: "Produto Live",
        featuredImageUrl: "https://cdn.example.com/live.jpg",
        variants: [{ price: { toNumber: () => 12.5 }, compareAtPrice: null }],
      },
    });

    const result = await resolveFunnelVersionForPreview("f1", "draft_1");
    expect(result).not.toBeNull();
    expect(result!.isPreview).toBe(true);
    expect(result!.snapshot.title).toBe("Produto Live");
    expect(result!.snapshot.unitPrice).toBe(12.5);
  });

  it("versionId de outro funil não resolve (nunca cruza funis)", async () => {
    versions.push({
      id: "draft_1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "DRAFT",
      productSnapshot: null,
    });
    expect(await resolveFunnelVersionForPreview("f2", "draft_1")).toBeNull();
  });

  it("sem produto PRIMARY no catálogo, preview falha fechada (null)", async () => {
    versions.push({
      id: "draft_1",
      funnelId: "f1",
      versionNumber: 1,
      configSchemaVersion: 1,
      config: validConfig(),
      status: "DRAFT",
      productSnapshot: null,
    });
    expect(await resolveFunnelVersionForPreview("f1", "draft_1")).toBeNull();
  });
});
