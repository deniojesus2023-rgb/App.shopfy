import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();
const createClientMock = vi.fn(() => ({ request: requestMock }));

vi.mock("./client", () => ({
  createShopifyGraphqlClient: createClientMock,
}));

const { createDraftOrder, findDraftOrdersByIdentity } = await import("./draft-orders");

const createdResponse = {
  draftOrderCreate: {
    draftOrder: {
      id: "gid://shopify/DraftOrder/1",
      name: "#D1",
      invoiceUrl: "https://loja.myshopify.com/invoices/abc",
    },
    userErrors: [],
  },
};

function baseInput(overrides: Partial<Parameters<typeof createDraftOrder>[2]> = {}) {
  return {
    currency: "COP",
    identity: "appshopfy_checkout_att1",
    identityAttributeKey: "_appshopfy_checkout",
    lineItems: [
      { variantId: "gid://shopify/ProductVariant/42", title: "Produto X", quantity: 2, unitPrice: "74950.00" },
    ],
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

describe("createDraftOrder — preço server-authoritative", () => {
  it("envia priceOverride por line item (é o que desacopla do preço de catálogo ao vivo)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder("loja.myshopify.com", "token", baseInput());

    const lineItem = lastVariables().input.lineItems[0];
    expect(lineItem.priceOverride).toEqual({ amount: "74950.00", currencyCode: "COP" });
  });

  it("preserva variantId e quantidade FÍSICA real (nunca quantity:1 fingindo N unidades)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder("loja.myshopify.com", "token", baseInput());

    const lineItem = lastVariables().input.lineItems[0];
    expect(lineItem.variantId).toBe("gid://shopify/ProductVariant/42");
    expect(lineItem.quantity).toBe(2);
    // Quantidade nunca vai codificada no título.
    expect(lineItem.title).toBeUndefined();
  });

  it("total não divisível vira dois line items da mesma variante, somando exato", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder(
      "loja.myshopify.com",
      "token",
      baseInput({
        lineItems: [
          { variantId: "gid://shopify/ProductVariant/42", title: "Produto X", quantity: 2, unitPrice: "49966.67" },
          { variantId: "gid://shopify/ProductVariant/42", title: "Produto X", quantity: 1, unitPrice: "49966.66" },
        ],
      })
    );

    const lineItems = lastVariables().input.lineItems;
    const quantity = lineItems.reduce((s: number, li: { quantity: number }) => s + li.quantity, 0);
    const cents = lineItems.reduce(
      (s: number, li: { quantity: number; priceOverride: { amount: string } }) =>
        s + Math.round(Number(li.priceOverride.amount) * 100) * li.quantity,
      0
    );
    expect(quantity).toBe(3);
    expect(cents).toBe(14990000);
  });

  it("sem variante congelada, cai em custom line item (mas mantém quantidade e preço)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder(
      "loja.myshopify.com",
      "token",
      baseInput({ lineItems: [{ variantId: null, title: "Produto X", quantity: 2, unitPrice: "74950.00" }] })
    );

    const lineItem = lastVariables().input.lineItems[0];
    expect(lineItem.variantId).toBeUndefined();
    expect(lineItem.title).toBe("Produto X");
    expect(lineItem.quantity).toBe(2);
  });
});

describe("createDraftOrder — identidade e PII", () => {
  it("grava a identidade em tag E custom attribute (papéis diferentes)", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder("loja.myshopify.com", "token", baseInput());

    const { input } = lastVariables();
    expect(input.tags).toContain("appshopfy_checkout_att1");
    expect(input.customAttributes).toEqual([{ key: "_appshopfy_checkout", value: "appshopfy_checkout_att1" }]);
  });

  it("nunca envia dados do cliente — o checkout da Shopify é quem coleta", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder("loja.myshopify.com", "token", baseInput());

    const { input } = lastVariables();
    expect(input).not.toHaveProperty("customer");
    expect(input).not.toHaveProperty("shippingAddress");
    expect(JSON.stringify(input)).not.toMatch(/name|phone|address|whatsapp/i);
  });
});

describe("createDraftOrder — falhas", () => {
  it("userErrors retorna outcome tipado em vez de lançar", async () => {
    requestMock.mockResolvedValue({
      draftOrderCreate: { draftOrder: null, userErrors: [{ field: ["lineItems"], message: "Variante inválida" }] },
    });

    const result = await createDraftOrder("loja.myshopify.com", "token", baseInput());

    expect(result).toEqual({ outcome: "userErrors", errors: ["Variante inválida"] });
  });

  it("draft criado SEM invoiceUrl falha fechado (nunca devolve botão que não leva a lugar nenhum)", async () => {
    requestMock.mockResolvedValue({
      draftOrderCreate: {
        draftOrder: { id: "gid://shopify/DraftOrder/1", name: "#D1", invoiceUrl: null },
        userErrors: [],
      },
    });

    const result = await createDraftOrder("loja.myshopify.com", "token", baseInput());

    expect(result.outcome).toBe("userErrors");
  });

  it("usa timeout explícito no cliente", async () => {
    requestMock.mockResolvedValue(createdResponse);

    await createDraftOrder("loja.myshopify.com", "token", baseInput());

    expect(createClientMock).toHaveBeenCalledWith(
      "loja.myshopify.com",
      "token",
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    );
  });
});

describe("findDraftOrdersByIdentity — reconciliação", () => {
  it("filtra por tag (único anchor pesquisável em draft orders)", async () => {
    requestMock.mockResolvedValue({ draftOrders: { edges: [] } });

    await findDraftOrdersByIdentity("loja.myshopify.com", "token", "appshopfy_checkout_att1");

    const [, variables] = requestMock.mock.calls.at(-1)!;
    expect(variables.query).toBe("tag:'appshopfy_checkout_att1'");
  });

  it("busca mais de um resultado para conseguir detectar duplicata (nunca first: 1)", async () => {
    requestMock.mockResolvedValue({ draftOrders: { edges: [] } });

    await findDraftOrdersByIdentity("loja.myshopify.com", "token", "appshopfy_checkout_att1");

    const [query] = requestMock.mock.calls.at(-1)!;
    expect(query).toMatch(/draftOrders\(first:\s*[2-9]/);
  });

  it("retorna todos os encontrados (o caller decide 0 / 1 / >1)", async () => {
    requestMock.mockResolvedValue({
      draftOrders: {
        edges: [
          { node: { id: "gid://shopify/DraftOrder/1", name: "#D1", invoiceUrl: "https://a" } },
          { node: { id: "gid://shopify/DraftOrder/2", name: "#D2", invoiceUrl: "https://b" } },
        ],
      },
    });

    const result = await findDraftOrdersByIdentity("loja.myshopify.com", "token", "appshopfy_checkout_att1");

    expect(result).toHaveLength(2);
  });

  it("ignora draft sem invoiceUrl (não serve para reconciliar um checkout)", async () => {
    requestMock.mockResolvedValue({
      draftOrders: { edges: [{ node: { id: "gid://shopify/DraftOrder/1", name: "#D1", invoiceUrl: null } }] },
    });

    const result = await findDraftOrdersByIdentity("loja.myshopify.com", "token", "appshopfy_checkout_att1");

    expect(result).toEqual([]);
  });
});
