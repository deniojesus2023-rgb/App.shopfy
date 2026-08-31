import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();
const createClientMock = vi.fn(() => ({ request: requestMock }));

vi.mock("./client", () => ({
  createShopifyGraphqlClient: createClientMock,
}));

const { createShopifyOrder, findShopifyOrdersBySourceIdentifier } = await import("./orders");

const createdResponse = {
  orderCreate: {
    order: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" },
    userErrors: [],
  },
};

function baseInput(overrides: Partial<Parameters<typeof createShopifyOrder>[2]> = {}) {
  return {
    currency: "COP",
    sourceIdentifier: "appshopfy_order_corder1",
    internalOrderTag: "internal_order_corder1",
    lineItems: [{ title: "Produto X", quantity: 1, unitPrice: "89900.00" }],
    shippingAddress: { firstName: "Maria", address1: "Calle 1", city: "Medellín", country: "CO" },
    ...overrides,
  };
}

function lastVariables() {
  return requestMock.mock.calls.at(-1)![1];
}

beforeEach(() => {
  requestMock.mockReset();
  createClientMock.mockClear();
});

describe("createShopifyOrder", () => {
  it("envia sourceIdentifier — identidade da reconciliação externa", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createShopifyOrder("loja.myshopify.com", "token", baseInput());

    expect(lastVariables().order.sourceIdentifier).toBe("appshopfy_order_corder1");
  });

  it("mantém a tag como apoio, mas ela nunca é a identidade (sourceIdentifier é independente)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createShopifyOrder(
      "loja.myshopify.com",
      "token",
      baseInput({ internalOrderTag: "internal_order_outro_valor" })
    );

    const { order } = lastVariables();
    expect(order.tags).toContain("internal_order_outro_valor");
    expect(order.tags).toContain("cod");
    // A identidade não muda junto com a tag — são campos independentes.
    expect(order.sourceIdentifier).toBe("appshopfy_order_corder1");
  });

  it("nunca marca financialStatus PAID e nunca envia transactions (COD não é pago no checkout)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createShopifyOrder("loja.myshopify.com", "token", baseInput());

    const { order } = lastVariables();
    expect(order.financialStatus).toBe("PENDING");
    expect(order).not.toHaveProperty("transactions");
    expect(JSON.stringify(order)).not.toMatch(/PAID|"SUCCESS"/);
  });

  it("priceSet preserva o quote: preço UNITÁRIO no dinheiro da loja, sem variantId", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createShopifyOrder(
      "loja.myshopify.com",
      "token",
      baseInput({ lineItems: [{ title: "Produto X", quantity: 3, unitPrice: "89900.00" }] })
    );

    const lineItem = lastVariables().order.lineItems[0];
    // Sem variantId, a Shopify não tem de onde buscar um preço "atual".
    expect(lineItem).not.toHaveProperty("variantId");
    // Unitário, não total da linha — a Shopify multiplica por quantity.
    expect(lineItem.priceSet.shopMoney).toEqual({ amount: "89900.00", currencyCode: "COP" });
    expect(lineItem.quantity).toBe(3);
  });

  it("userErrors: retorna outcome 'userErrors' em vez de lançar", async () => {
    requestMock.mockResolvedValue({
      orderCreate: { order: null, userErrors: [{ field: ["shippingAddress"], message: "Endereço inválido" }] },
    });

    const result = await createShopifyOrder("loja.myshopify.com", "token", baseInput());

    expect(result).toEqual({ outcome: "userErrors", errors: ["Endereço inválido"] });
  });

  it("usa timeout explícito no cliente (conexão pendurada vira erro classificável)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createShopifyOrder("loja.myshopify.com", "token", baseInput());

    expect(createClientMock).toHaveBeenCalledWith(
      "loja.myshopify.com",
      "token",
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    );
  });
});

describe("findShopifyOrdersBySourceIdentifier", () => {
  it("filtra por source_identifier (não por tag)", async () => {
    requestMock.mockResolvedValue({ orders: { edges: [] } });

    await findShopifyOrdersBySourceIdentifier("loja.myshopify.com", "token", "appshopfy_order_corder1");

    const [query, variables] = requestMock.mock.calls.at(-1)!;
    expect(variables.query).toBe("source_identifier:'appshopfy_order_corder1'");
    expect(query).not.toMatch(/tag:/);
  });

  it("busca mais de um resultado para conseguir detectar duplicata (nunca first: 1)", async () => {
    requestMock.mockResolvedValue({ orders: { edges: [] } });

    await findShopifyOrdersBySourceIdentifier("loja.myshopify.com", "token", "appshopfy_order_corder1");

    const [query] = requestMock.mock.calls.at(-1)!;
    expect(query).toMatch(/orders\(first:\s*[2-9]/);
  });

  it("retorna lista vazia quando não encontra nada", async () => {
    requestMock.mockResolvedValue({ orders: { edges: [] } });
    const result = await findShopifyOrdersBySourceIdentifier("loja.myshopify.com", "token", "appshopfy_order_x");
    expect(result).toEqual([]);
  });

  it("retorna todos os pedidos encontrados (o caller decide 0 / 1 / >1)", async () => {
    requestMock.mockResolvedValue({
      orders: {
        edges: [
          { node: { id: "gid://shopify/Order/1", name: "#1001", createdAt: "2026-01-01T00:00:00Z" } },
          { node: { id: "gid://shopify/Order/2", name: "#1002", createdAt: "2026-01-01T00:01:00Z" } },
        ],
      },
    });

    const result = await findShopifyOrdersBySourceIdentifier("loja.myshopify.com", "token", "appshopfy_order_x");

    expect(result).toEqual([
      { shopifyOrderId: "gid://shopify/Order/1", shopifyOrderName: "#1001", shopifyCreatedAt: "2026-01-01T00:00:00Z" },
      { shopifyOrderId: "gid://shopify/Order/2", shopifyOrderName: "#1002", shopifyCreatedAt: "2026-01-01T00:01:00Z" },
    ]);
  });
});
