import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeOrder {
  id: string;
  workspaceId: string;
  orderNumber: number;
  status: string;
}

let orders: FakeOrder[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findMany: vi.fn(
        async ({ where }: { where: { workspaceId: string; status?: string; orderNumber?: number } }) =>
          orders.filter(
            (o) =>
              o.workspaceId === where.workspaceId &&
              (where.status === undefined || o.status === where.status) &&
              (where.orderNumber === undefined || o.orderNumber === where.orderNumber)
          )
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; workspaceId: string } }) =>
        orders.find((o) => o.id === where.id && o.workspaceId === where.workspaceId) ?? null
      ),
    },
  },
}));

const { listOrdersForWorkspace, getOrderForWorkspace } = await import("./service");

beforeEach(() => {
  orders = [
    { id: "corder1", workspaceId: "ws_1", orderNumber: 1048, status: "PENDING" },
    { id: "corder2", workspaceId: "ws_2", orderNumber: 1049, status: "PENDING" },
  ];
});

describe("listOrdersForWorkspace (isolamento de tenant)", () => {
  it("nunca retorna pedido de outro workspace", async () => {
    const result = await listOrdersForWorkspace("ws_1");
    expect(result.map((o) => o.id)).toEqual(["corder1"]);
  });

  it("filtra por status dentro do próprio workspace", async () => {
    orders.push({ id: "corder3", workspaceId: "ws_1", orderNumber: 1050, status: "CANCELLED" });
    const result = await listOrdersForWorkspace("ws_1", { status: "CANCELLED" as never });
    expect(result.map((o) => o.id)).toEqual(["corder3"]);
  });

  it("busca por orderNumber nunca vaza pedido de outro workspace mesmo com o número certo", async () => {
    const result = await listOrdersForWorkspace("ws_1", { search: "1049" });
    expect(result).toEqual([]);
  });
});

describe("getOrderForWorkspace (isolamento de tenant)", () => {
  it("nunca resolve um Order de outro workspace", async () => {
    await expect(getOrderForWorkspace("ws_1", "corder2")).rejects.toThrow();
  });

  it("resolve normalmente dentro do próprio workspace", async () => {
    const order = await getOrderForWorkspace("ws_1", "corder1");
    expect(order.id).toBe("corder1");
  });
});
