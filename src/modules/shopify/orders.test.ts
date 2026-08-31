import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();

vi.mock("./client", () => ({
  createShopifyGraphqlClient: vi.fn(() => ({ request: requestMock })),
}));

const { createShopifyOrder, findShopifyOrderByInternalTag } = await import("./orders");

beforeEach(() => {
  requestMock.mockReset();
});

describe("createShopifyOrder", () => {
  it("nunca marca financialStatus como PAID — sempre PENDING (COD, nunca paga de verdade)", async () => {
    requestMock.mockResolvedValue({
      orderCreate: { order: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" }, userErrors: [] },
    });

    await createShopifyOrder("loja.myshopify.com", "token", {
      currency: "COP",
      internalOrderTag: "internal_order_abc",
      lineItems: [{ title: "Produto X", quantity: 1, unitPrice: "100.00" }],
      shippingAddress: { firstName: "Maria", address1: "Calle 1", city: "Medellín", country: "CO" },
    });

    const [, variables] = requestMock.mock.calls[0];
    expect(variables.order.financialStatus).toBe("PENDING");
  });

  it("usa custom line items (sem variantId) com o preço exato do quote — nunca o preço vivo do Product", async () => {
    requestMock.mockResolvedValue({
      orderCreate: { order: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" }, userErrors: [] },
    });

    await createShopifyOrder("loja.myshopify.com", "token", {
      currency: "COP",
      internalOrderTag: "internal_order_abc",
      lineItems: [{ title: "Produto X", quantity: 2, unitPrice: "89900.00" }],
      shippingAddress: { firstName: "Maria", address1: "Calle 1", city: "Medellín", country: "CO" },
    });

    const [, variables] = requestMock.mock.calls[0];
    expect(variables.order.lineItems[0]).not.toHaveProperty("variantId");
    expect(variables.order.lineItems[0].priceSet.shopMoney).toEqual({ amount: "89900.00", currencyCode: "COP" });
    expect(variables.order.lineItems[0].quantity).toBe(2);
  });

  it("inclui a tag interna sempre (base da reconciliação) e nunca PII na tag", async () => {
    requestMock.mockResolvedValue({
      orderCreate: { order: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" }, userErrors: [] },
    });

    await createShopifyOrder("loja.myshopify.com", "token", {
      currency: "COP",
      internalOrderTag: "internal_order_abc",
      lineItems: [{ title: "X", quantity: 1, unitPrice: "1.00" }],
      shippingAddress: { firstName: "Maria", address1: "Calle 1", city: "Medellín", country: "CO" },
    });

    const [, variables] = requestMock.mock.calls[0];
    expect(variables.order.tags).toContain("internal_order_abc");
    expect(variables.order.tags).toContain("cod");
  });

  it("userErrors: retorna outcome 'userErrors' em vez de lançar", async () => {
    requestMock.mockResolvedValue({
      orderCreate: { order: null, userErrors: [{ field: ["shippingAddress"], message: "Endereço inválido" }] },
    });

    const result = await createShopifyOrder("loja.myshopify.com", "token", {
      currency: "COP",
      internalOrderTag: "internal_order_abc",
      lineItems: [{ title: "X", quantity: 1, unitPrice: "1.00" }],
      shippingAddress: { firstName: "Maria", address1: "Calle 1", city: "Medellín", country: "CO" },
    });

    expect(result).toEqual({ outcome: "userErrors", errors: ["Endereço inválido"] });
  });
});

describe("findShopifyOrderByInternalTag", () => {
  it("busca pela tag exata, sem `:` (sintaxe de busca da Shopify usa `:` como delimitador)", async () => {
    requestMock.mockResolvedValue({ orders: { edges: [] } });
    await findShopifyOrderByInternalTag("loja.myshopify.com", "token", "internal_order_abc");

    const [, variables] = requestMock.mock.calls[0];
    expect(variables.query).toBe("tag:'internal_order_abc'");
  });

  it("retorna null quando não encontra nada", async () => {
    requestMock.mockResolvedValue({ orders: { edges: [] } });
    const result = await findShopifyOrderByInternalTag("loja.myshopify.com", "token", "internal_order_abc");
    expect(result).toBeNull();
  });

  it("retorna o pedido encontrado (reconciliação)", async () => {
    requestMock.mockResolvedValue({
      orders: { edges: [{ node: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" } }] },
    });
    const result = await findShopifyOrderByInternalTag("loja.myshopify.com", "token", "internal_order_abc");
    expect(result).toEqual({ shopifyOrderId: "gid://shopify/Order/1", shopifyOrderName: "#1001", shopifyCreatedAt: "2026-01-01T00:00:00Z" });
  });
});
