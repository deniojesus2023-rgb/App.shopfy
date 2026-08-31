import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeJob {
  id: string;
  workspaceId: string | null;
  type: string;
  payload: unknown;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  completedAt: Date | null;
}

let jobs: FakeJob[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  prisma: {
    backgroundJob: {
      create: vi.fn(async ({ data }: { data: Partial<FakeJob> }) => {
        const row: FakeJob = {
          id: `job_${nextId++}`,
          workspaceId: data.workspaceId ?? null,
          type: data.type as string,
          payload: data.payload,
          status: "PENDING",
          attempts: 0,
          maxAttempts: data.maxAttempts ?? 5,
          runAt: data.runAt as Date,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          completedAt: null,
        };
        jobs.push(row);
        return row;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const job = jobs.find((j) => j.id === where.id);
        if (!job) throw new Error("not found");
        return job;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeJob> }) => {
        const job = jobs.find((j) => j.id === where.id)!;
        Object.assign(job, data);
        return job;
      }),
    },
    // Simula o claim atômico via SKIP LOCKED: pega o primeiro job elegível
    // (PENDING com runAt <= now) que ainda não foi "travado" nesta rodada
    // de teste, marca PROCESSING e incrementa attempts — replicando o
    // efeito observável da query raw sem depender de um Postgres real.
    $queryRaw: vi.fn(async () => {
      const now = new Date();
      const eligible = jobs.find((j) => j.status === "PENDING" && j.runAt <= now);
      if (!eligible) return [];
      eligible.status = "PROCESSING";
      eligible.lockedAt = now;
      eligible.attempts += 1;
      return [eligible];
    }),
  },
}));

const { enqueueJob, claimNextJob, completeJob, failJob } = await import("./service");

beforeEach(() => {
  jobs = [];
  nextId = 1;
  vi.useRealTimers();
});

describe("enqueueJob", () => {
  it("valida o payload com Zod antes de persistir", async () => {
    await expect(
      enqueueJob({
        type: "SHOPIFY_PRODUCT_SYNC",
        // @ts-expect-error payload propositalmente inválido para o teste
        payload: { workspaceId: "not-a-cuid" },
      })
    ).rejects.toThrow();
    expect(jobs).toHaveLength(0);
  });

  it("persiste um job válido como PENDING", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
    });
    expect(job.status).toBe("PENDING");
  });
});

describe("claimNextJob", () => {
  it("reivindica um job pendente e marca PROCESSING", async () => {
    await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
    });

    const claimed = await claimNextJob("worker-1");
    expect(claimed?.status).toBe("PROCESSING");
    expect(claimed?.attempts).toBe(1);
  });

  it("retorna null quando não há job elegível — dois workers não pegam o mesmo job", async () => {
    await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
    });

    const first = await claimNextJob("worker-1");
    const second = await claimNextJob("worker-2");

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

describe("completeJob", () => {
  it("marca COMPLETED e limpa lastError", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
    });
    await completeJob(job.id);
    expect(jobs[0].status).toBe("COMPLETED");
    expect(jobs[0].completedAt).not.toBeNull();
  });
});

describe("failJob (retry com backoff)", () => {
  it("reagenda para PENDING com runAt no futuro quando ainda há tentativas", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
      maxAttempts: 3,
    });
    await claimNextJob(); // attempts vira 1

    const before = Date.now();
    await failJob(job.id, new Error("network timeout"));

    const updated = jobs[0];
    expect(updated.status).toBe("PENDING");
    expect(updated.lastError).toBe("network timeout");
    expect(updated.runAt.getTime()).toBeGreaterThan(before);
  });

  it("marca FAILED definitivo quando esgota maxAttempts", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
      maxAttempts: 1,
    });
    await claimNextJob(); // attempts vira 1 = maxAttempts

    await failJob(job.id, new Error("erro final"));

    expect(jobs[0].status).toBe("FAILED");
    expect(jobs[0].lastError).toBe("erro final");
  });

  it("com retryable:false vai direto para FAILED mesmo com tentativas sobrando", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
      maxAttempts: 5,
    });
    await claimNextJob(); // attempts vira 1, de 5

    await failJob(job.id, new Error("token inválido"), { retryable: false });

    expect(jobs[0].status).toBe("FAILED");
  });

  it("backoff cresce a cada tentativa (exponencial)", async () => {
    const job = await enqueueJob({
      type: "SHOPIFY_PRODUCT_DELETE",
      payload: {
        workspaceId: "clabc0000000000000000001",
        shopifyStoreId: "clabc0000000000000000002",
        shopifyProductId: "gid://shopify/Product/1",
      },
      maxAttempts: 10,
    });

    await claimNextJob();
    await failJob(job.id, new Error("erro 1"));
    const firstDelay = jobs[0].runAt.getTime() - Date.now();

    jobs[0].status = "PENDING";
    jobs[0].runAt = new Date();
    await claimNextJob();
    await failJob(job.id, new Error("erro 2"));
    const secondDelay = jobs[0].runAt.getTime() - Date.now();

    expect(secondDelay).toBeGreaterThan(firstDelay);
  });
});
