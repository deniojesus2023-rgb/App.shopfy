import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

interface FakeEventRow {
  id: string;
  shopDomain: string;
  topic: string;
  shopifyWebhookId: string;
  payload: unknown;
  status: string;
}

let events: FakeEventRow[] = [];
let nextId = 1;

vi.mock("@/lib/db", () => ({
  prisma: {
    shopifyStore: {
      findUnique: vi.fn(async () => null),
    },
    shopifyWebhookEvent: {
      create: vi.fn(async ({ data }: { data: Omit<FakeEventRow, "id" | "status"> }) => {
        if (events.some((e) => e.shopifyWebhookId === data.shopifyWebhookId)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        const row: FakeEventRow = { id: `evt_${nextId++}`, status: "RECEIVED", ...data };
        events.push(row);
        return row;
      }),
    },
  },
}));

const { persistWebhookEvent } = await import("./service");

beforeEach(() => {
  events = [];
  nextId = 1;
});

describe("persistWebhookEvent (idempotência)", () => {
  it("persiste um webhook novo", async () => {
    const result = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });

    expect(result.outcome).toBe("created");
    expect(events).toHaveLength(1);
  });

  it("trata reentrega do mesmo shopifyWebhookId como duplicata, sem criar segunda linha", async () => {
    const first = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });
    const second = await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });

    expect(first.outcome).toBe("created");
    expect(second.outcome).toBe("duplicate");
    expect(events).toHaveLength(1);
  });

  it("dois shopifyWebhookId diferentes geram duas linhas", async () => {
    await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_1",
      payload: { id: 1 },
    });
    await persistWebhookEvent({
      shopDomain: "loja.myshopify.com",
      topic: "orders/create",
      shopifyWebhookId: "wh_2",
      payload: { id: 2 },
    });

    expect(events).toHaveLength(2);
  });
});
