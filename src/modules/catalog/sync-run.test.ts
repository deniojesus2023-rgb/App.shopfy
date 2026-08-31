import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRun {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  type: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  productsProcessed: number;
  variantsProcessed: number;
  error: string | null;
  createdAt: Date;
}

let runs: FakeRun[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  prisma: {
    catalogSyncRun: {
      create: vi.fn(async ({ data }: { data: Partial<FakeRun> }) => {
        const row: FakeRun = {
          id: `run_${nextId++}`,
          workspaceId: data.workspaceId as string,
          shopifyStoreId: data.shopifyStoreId as string,
          type: data.type as string,
          status: data.status as string,
          startedAt: null,
          finishedAt: null,
          productsProcessed: 0,
          variantsProcessed: 0,
          error: null,
          createdAt: new Date(),
        };
        runs.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status: { in: string[] } };
          data: Partial<FakeRun>;
        }) => {
          const row = runs.find((r) => r.id === where.id && where.status.in.includes(r.status));
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = runs.find((r) => r.id === where.id)!;
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) {
            (row as unknown as Record<string, number>)[key] += (value as { increment: number }).increment;
          } else {
            (row as unknown as Record<string, unknown>)[key] = value;
          }
        }
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: { shopifyStoreId: string } }) => {
        const matches = runs
          .filter((r) => r.shopifyStoreId === where.shopifyStoreId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      }),
    },
  },
}));

const {
  createSyncRun,
  markSyncRunRunning,
  incrementSyncRunCounters,
  completeSyncRun,
  failSyncRun,
  getLatestSyncRun,
} = await import("./sync-run");

beforeEach(() => {
  runs = [];
  nextId = 1;
});

describe("CatalogSyncRun", () => {
  it("cria run PENDING e transiciona para RUNNING", async () => {
    const run = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "FULL" });
    expect(run.status).toBe("PENDING");

    await markSyncRunRunning(run.id);
    expect(runs[0].status).toBe("RUNNING");
    expect(runs[0].startedAt).not.toBeNull();
  });

  it("acumula contadores de produtos/variantes entre páginas", async () => {
    const run = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "FULL" });
    await incrementSyncRunCounters(run.id, { products: 50, variants: 120 });
    await incrementSyncRunCounters(run.id, { products: 30, variants: 90 });

    expect(runs[0].productsProcessed).toBe(80);
    expect(runs[0].variantsProcessed).toBe(210);
  });

  it("completeSyncRun marca COMPLETED com finishedAt", async () => {
    const run = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "FULL" });
    await completeSyncRun(run.id);
    expect(runs[0].status).toBe("COMPLETED");
    expect(runs[0].finishedAt).not.toBeNull();
  });

  it("failSyncRun marca FAILED com a mensagem de erro", async () => {
    const run = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "FULL" });
    await failSyncRun(run.id, "token inválido");
    expect(runs[0].status).toBe("FAILED");
    expect(runs[0].error).toBe("token inválido");
  });

  it("getLatestSyncRun retorna o run mais recente da loja", async () => {
    const older = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "FULL" });
    older.createdAt = new Date("2026-01-01");
    runs[0].createdAt = new Date("2026-01-01");

    const newer = await createSyncRun({ workspaceId: "ws_1", shopifyStoreId: "store_1", type: "INCREMENTAL" });
    runs[1].createdAt = new Date("2026-02-01");

    const latest = await getLatestSyncRun("store_1");
    expect(latest?.id).toBe(newer.id);
  });
});
