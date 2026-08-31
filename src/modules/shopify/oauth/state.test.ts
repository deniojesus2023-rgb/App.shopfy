import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeStateRow {
  id: string;
  state: string;
  workspaceId: string;
  userId: string;
  shopDomain: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

let rows: FakeStateRow[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyOAuthState: {
      create: vi.fn(async ({ data }: { data: Omit<FakeStateRow, "id" | "consumedAt"> }) => {
        const row: FakeStateRow = { id: `id_${nextId++}`, consumedAt: null, ...data };
        rows.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where: { state } }: { where: { state: string } }) => {
        return rows.find((r) => r.state === state) ?? null;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; consumedAt: null };
          data: { consumedAt: Date };
        }) => {
          const row = rows.find((r) => r.id === where.id && r.consumedAt === where.consumedAt);
          if (!row) return { count: 0 };
          row.consumedAt = data.consumedAt;
          return { count: 1 };
        }
      ),
    },
  },
}));

const { createOAuthState, consumeOAuthState } = await import("./state");

beforeEach(() => {
  rows = [];
  nextId = 1;
});

describe("OAuth state (single-use)", () => {
  it("consome um state válido e retorna os dados associados", async () => {
    const state = await createOAuthState({
      workspaceId: "ws_1",
      userId: "user_1",
      shopDomain: "loja.myshopify.com",
    });

    const result = await consumeOAuthState(state, "loja.myshopify.com");
    expect(result).toEqual({
      workspaceId: "ws_1",
      userId: "user_1",
      shopDomain: "loja.myshopify.com",
    });
  });

  it("rejeita reuso do mesmo state (replay)", async () => {
    const state = await createOAuthState({
      workspaceId: "ws_1",
      userId: "user_1",
      shopDomain: "loja.myshopify.com",
    });

    await consumeOAuthState(state, "loja.myshopify.com");
    await expect(consumeOAuthState(state, "loja.myshopify.com")).rejects.toThrow();
  });

  it("rejeita state inexistente", async () => {
    await expect(consumeOAuthState("state-que-nunca-existiu", "loja.myshopify.com")).rejects.toThrow();
  });

  it("rejeita quando o shopDomain não bate com o state gerado", async () => {
    const state = await createOAuthState({
      workspaceId: "ws_1",
      userId: "user_1",
      shopDomain: "loja.myshopify.com",
    });

    await expect(consumeOAuthState(state, "outra-loja.myshopify.com")).rejects.toThrow();
  });

  it("rejeita state expirado", async () => {
    const state = await createOAuthState({
      workspaceId: "ws_1",
      userId: "user_1",
      shopDomain: "loja.myshopify.com",
    });
    // Força expiração manualmente (sem depender de setTimeout real).
    rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(consumeOAuthState(state, "loja.myshopify.com")).rejects.toThrow();
  });
});
