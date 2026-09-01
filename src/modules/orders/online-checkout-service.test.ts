import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

interface FakeFunnel {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  status: string;
  publishedVersionId: string | null;
  shopifyStore: { shopDomain: string; status: string; currency: string };
}

interface FakeVersion {
  id: string;
  funnelId: string;
  configSchemaVersion: number;
  config: unknown;
  status: string;
  supersededAt: Date | null;
  productSnapshot: {
    title: string;
    unitPrice: Prisma.Decimal;
    productId: string | null;
    productVariantId: string | null;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
    variantTitle: string | null;
    sku: string | null;
    featuredImageUrl: string | null;
    compareAtPrice: number | null;
  } | null;
}

interface FakeAttempt {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  funnelId: string;
  funnelVersionId: string;
  idempotencyKey: string;
  checkoutAttemptId: string;
  selectedOfferId: string | null;
  selectedPaymentMethodId: string | null;
  currency: string;
  quoteSnapshot: unknown;
  merchandiseTotal: number;
  status: string;
  shopifyDraftOrderId: string | null;
  shopifyDraftOrderName: string | null;
  checkoutUrl: string | null;
  orderId: string | null;
  expiresAt: Date;
  completedAt: Date | null;
}

let funnels: FakeFunnel[] = [];
let versions: FakeVersion[] = [];
let attempts: FakeAttempt[] = [];
let nextId = 1;

const onlineCheckoutEnabled = { value: true };

function fakeCuid(n: number) {
  return `c${String(n).padStart(24, "0")}`;
}

const db = {
  funnel: {
    findUnique: vi.fn(async ({ where }: { where: { publicId: string } }) => {
      return funnels.find((f) => f.id === where.publicId) ?? null;
    }),
  },
  funnelVersion: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; funnelId: string } }) => {
      return versions.find((v) => v.id === where.id && v.funnelId === where.funnelId) ?? null;
    }),
  },
  onlineCheckoutAttempt: {
    findUnique: vi.fn(async ({ where }: { where: { idempotencyKey?: string; id?: string } }) => {
      if (where.idempotencyKey) return attempts.find((a) => a.idempotencyKey === where.idempotencyKey) ?? null;
      return attempts.find((a) => a.id === where.id) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (attempts.some((a) => a.idempotencyKey === data.idempotencyKey)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      }
      const row = { ...data, id: fakeCuid(nextId++) } as unknown as FakeAttempt;
      attempts.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = attempts.find((a) => a.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  },
};

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/modules/audit/service", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { SHOPIFY_ONLINE_CHECKOUT_ENABLED: onlineCheckoutEnabled.value };
  },
}));

const getDecryptedAccessTokenMock = vi.fn(async () => "token");
vi.mock("@/modules/shopify/stores/service", () => ({
  getDecryptedAccessToken: getDecryptedAccessTokenMock,
}));

const createDraftOrderMock = vi.fn();
const findDraftOrdersByIdentityMock = vi.fn<
  () => Promise<Array<{ draftOrderId: string; draftOrderName: string; invoiceUrl: string }>>
>(async () => []);
vi.mock("@/modules/shopify/draft-orders", () => ({
  createDraftOrder: createDraftOrderMock,
  findDraftOrdersByIdentity: findDraftOrdersByIdentityMock,
}));

const { startOnlineCheckout } = await import("./online-checkout-service");

const theme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM" as const,
  fontFamily: "SYSTEM" as const,
  buttonStyle: "SOLID" as const,
};

function productStep() {
  return {
    id: "product",
    type: "PRODUCT" as const,
    enabled: true,
    order: 0,
    config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "Comprar" },
  };
}
function successStep() {
  return {
    id: "success",
    type: "SUCCESS" as const,
    enabled: true,
    order: 1,
    config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
  };
}
function paymentStep(methods: unknown[]) {
  return {
    id: "payment",
    type: "PAYMENT_CHOICE" as const,
    enabled: true,
    order: 2,
    config: { paymentMethods: methods },
  };
}
function offerStep() {
  return {
    id: "offer",
    type: "OFFER" as const,
    enabled: true,
    order: 3,
    config: {
      offers: [
        { id: "o1", quantity: 1, label: "1x", pricing: { type: "UNIT_MULTIPLIER" as const } },
        { id: "o2", quantity: 2, label: "2x", pricing: { type: "FIXED_TOTAL" as const, amount: 149900 } },
      ],
    },
  };
}

const onlineMethod = {
  id: "online",
  method: "ONLINE" as const,
  provider: "SHOPIFY_CHECKOUT" as const,
  enabled: true,
  label: "Pagar ahora",
  pricing: { type: "NONE" as const },
};
const codMethod = {
  id: "cod",
  method: "COD" as const,
  provider: "INTERNAL_COD" as const,
  enabled: true,
  label: "COD",
  pricing: { type: "NONE" as const },
};

function seedFunnel(steps: unknown[] = [productStep(), successStep(), paymentStep([codMethod, onlineMethod]), offerStep()]) {
  funnels.push({
    id: "funnel_1",
    workspaceId: "ws_1",
    shopifyStoreId: "store_1",
    status: "PUBLISHED",
    publishedVersionId: "version_1",
    shopifyStore: { shopDomain: "loja.myshopify.com", status: "CONNECTED", currency: "COP" },
  });
  versions.push({
    id: "version_1",
    funnelId: "funnel_1",
    configSchemaVersion: 4,
    config: { schemaVersion: 4, theme, steps, settings: {} },
    status: "PUBLISHED",
    supersededAt: null,
    productSnapshot: {
      title: "Produto X",
      unitPrice: new Prisma.Decimal(89900),
      productId: "prod_1",
      productVariantId: "pv_1",
      shopifyProductId: "gid://shopify/Product/1",
      shopifyVariantId: "gid://shopify/ProductVariant/42",
      variantTitle: "Default",
      sku: "SKU-1",
      featuredImageUrl: null,
      compareAtPrice: null,
    },
  });
}

function baseInput(overrides: Partial<Parameters<typeof startOnlineCheckout>[0]> = {}) {
  return {
    funnelPublicId: "funnel_1",
    funnelVersionId: "version_1",
    checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
    selectedOfferId: "o2",
    selectedPaymentMethodId: "online",
    ...overrides,
  };
}

beforeEach(() => {
  funnels = [];
  versions = [];
  attempts = [];
  nextId = 1;
  onlineCheckoutEnabled.value = true;
  getDecryptedAccessTokenMock.mockClear();
  findDraftOrdersByIdentityMock.mockClear();
  findDraftOrdersByIdentityMock.mockResolvedValue([]);
  createDraftOrderMock.mockReset();
  createDraftOrderMock.mockResolvedValue({
    outcome: "created",
    result: {
      draftOrderId: "gid://shopify/DraftOrder/1",
      draftOrderName: "#D1",
      invoiceUrl: "https://loja.myshopify.com/invoices/abc",
    },
  });
});

describe("startOnlineCheckout — autoridade do servidor", () => {
  it("devolve só a checkoutUrl, nunca IDs internos", async () => {
    seedFunnel();
    const result = await startOnlineCheckout(baseInput());
    expect(Object.keys(result)).toEqual(["checkoutUrl"]);
    expect(result.checkoutUrl).toBe("https://loja.myshopify.com/invoices/abc");
  });

  it("o preço enviado à Shopify vem do Quote do servidor, nunca do client", async () => {
    seedFunnel();
    // Payload bruto tentando injetar dinheiro (bypass de tipo).
    await startOnlineCheckout(
      baseInput({ ...({ total: 1, priceOverride: 1, discount: 99999, currency: "USD" } as object) })
    );

    const input = createDraftOrderMock.mock.calls[0][2];
    // Oferta o2: FIXED_TOTAL 149.900 em 2 unidades -> 74.950 cada.
    expect(input.currency).toBe("COP");
    expect(input.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/42", title: "Produto X", quantity: 2, unitPrice: "74950.00" },
    ]);
  });

  it("preserva variantId e quantidade física real na projeção", async () => {
    seedFunnel();
    await startOnlineCheckout(baseInput());
    const input = createDraftOrderMock.mock.calls[0][2];
    const quantity = input.lineItems.reduce((s: number, li: { quantity: number }) => s + li.quantity, 0);
    expect(quantity).toBe(2);
    expect(input.lineItems[0].variantId).toBe("gid://shopify/ProductVariant/42");
  });

  it("persiste o quote congelado na tentativa (auditável depois)", async () => {
    seedFunnel();
    await startOnlineCheckout(baseInput());
    const quote = attempts[0].quoteSnapshot as { total: number; subtotal: number };
    expect(quote.total).toBe(149900);
    expect(quote.subtotal).toBe(179800);
    expect(Number(attempts[0].merchandiseTotal)).toBe(149900);
  });
});

describe("startOnlineCheckout — método e provider server-authoritative", () => {
  it("rejeita método inexistente", async () => {
    seedFunnel();
    await expect(startOnlineCheckout(baseInput({ selectedPaymentMethodId: "nao-existe" }))).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita método desabilitado", async () => {
    seedFunnel([productStep(), successStep(), paymentStep([codMethod, { ...onlineMethod, enabled: false }]), offerStep()]);
    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita método COD neste endpoint (COD tem fluxo próprio)", async () => {
    seedFunnel();
    await expect(startOnlineCheckout(baseInput({ selectedPaymentMethodId: "cod" }))).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita provider YAMPI (ONLINE, mas sem integração)", async () => {
    seedFunnel([
      productStep(),
      successStep(),
      paymentStep([codMethod, { ...onlineMethod, id: "yampi", provider: "YAMPI" as const }]),
      offerStep(),
    ]);
    await expect(startOnlineCheckout(baseInput({ selectedPaymentMethodId: "yampi" }))).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita quando a feature flag está desligada (fail closed)", async () => {
    onlineCheckoutEnabled.value = false;
    seedFunnel();
    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita quando a loja não está conectada, mesmo com a flag ligada", async () => {
    seedFunnel();
    funnels[0].shopifyStore.status = "DISCONNECTED";
    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(createDraftOrderMock).not.toHaveBeenCalled();
  });

  it("rejeita oferta inválida", async () => {
    seedFunnel();
    await expect(startOnlineCheckout(baseInput({ selectedOfferId: "nao-existe" }))).rejects.toThrow();
  });
});

describe("startOnlineCheckout — idempotência", () => {
  it("mesmo checkoutAttemptId devolve o MESMO checkout, sem criar segundo draft order", async () => {
    seedFunnel();
    const first = await startOnlineCheckout(baseInput());
    const second = await startOnlineCheckout(baseInput());

    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(createDraftOrderMock).toHaveBeenCalledTimes(1);
    expect(attempts).toHaveLength(1);
  });

  it("attempt diferente cria um checkout separado", async () => {
    seedFunnel();
    await startOnlineCheckout(baseInput());
    await startOnlineCheckout(baseInput({ checkoutAttemptId: "22222222-2222-4222-8222-222222222222" }));

    expect(createDraftOrderMock).toHaveBeenCalledTimes(2);
    expect(attempts).toHaveLength(2);
  });

  it("retry após falha ambígua reconcilia por tag antes de criar de novo", async () => {
    seedFunnel();
    createDraftOrderMock.mockRejectedValueOnce(new Error("network"));
    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(attempts[0].status).toBe("CREATING");

    // A tentativa anterior tinha criado o draft na Shopify.
    findDraftOrdersByIdentityMock.mockResolvedValue([
      { draftOrderId: "gid://shopify/DraftOrder/9", draftOrderName: "#D9", invoiceUrl: "https://loja/invoices/9" },
    ]);

    const result = await startOnlineCheckout(baseInput());

    expect(findDraftOrdersByIdentityMock).toHaveBeenCalled();
    expect(result.checkoutUrl).toBe("https://loja/invoices/9");
    // Não criou um segundo draft order.
    expect(createDraftOrderMock).toHaveBeenCalledTimes(1);
  });

  it("múltiplos draft orders com a mesma identidade travam em MANUAL_REVIEW", async () => {
    seedFunnel();
    createDraftOrderMock.mockRejectedValueOnce(new Error("network"));
    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();

    findDraftOrdersByIdentityMock.mockResolvedValue([
      { draftOrderId: "gid://shopify/DraftOrder/1", draftOrderName: "#D1", invoiceUrl: "https://a" },
      { draftOrderId: "gid://shopify/DraftOrder/2", draftOrderName: "#D2", invoiceUrl: "https://b" },
    ]);

    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(attempts[0].status).toBe("MANUAL_REVIEW");
  });

  it("tentativa já COMPLETED nunca monta um checkout novo por cima", async () => {
    seedFunnel();
    await startOnlineCheckout(baseInput());
    attempts[0].status = "COMPLETED";

    await expect(startOnlineCheckout(baseInput())).rejects.toThrow();
    expect(createDraftOrderMock).toHaveBeenCalledTimes(1);
  });
});

describe("startOnlineCheckout — nunca cria pedido local", () => {
  it("o fluxo ONLINE não cria Order nem enfileira SHOPIFY_ORDER_CREATE", async () => {
    seedFunnel();
    await startOnlineCheckout(baseInput());
    // O mock de prisma nem expõe `order`/`backgroundJob`: se o serviço
    // tentasse usá-los, o teste explodiria.
    expect(db).not.toHaveProperty("order");
    expect(attempts[0].orderId).toBeUndefined();
    expect(attempts[0].status).toBe("READY");
  });
});
