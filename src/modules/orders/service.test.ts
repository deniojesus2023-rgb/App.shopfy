import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

interface FakeFunnel {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  status: string;
  publishedVersionId: string | null;
}

interface FakeVersion {
  id: string;
  funnelId: string;
  configSchemaVersion: number;
  config: unknown;
  status: string;
  supersededAt: Date | null;
  productSnapshot: { title: string; featuredImageUrl: string | null; unitPrice: Prisma.Decimal; compareAtPrice: number | null } | null;
}

interface FakeStore {
  id: string;
  currency: string;
}

interface FakeOrder {
  id: string;
  workspaceId: string;
  shopifyStoreId: string;
  funnelId: string;
  funnelVersionId: string;
  codLeadId: string;
  publicOrderId: string;
  orderNumber: number;
  idempotencyKey: string;
  status: string;
  paymentMethod: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: Prisma.Decimal;
}

let funnels: FakeFunnel[] = [];
let versions: FakeVersion[] = [];
let stores: FakeStore[] = [];
let orders: FakeOrder[] = [];
let codLeads: Array<{ id: string; name: string; phone: string }> = [];
let orderItems: unknown[] = [];
let statusHistory: unknown[] = [];
let backgroundJobs: unknown[] = [];
let nextId = 1;
let orderNumberSeq = 1047;

// IDs de fixture precisam parecer CUIDs de verdade: `shopifyOrderCreatePayloadSchema`
// valida `orderId` com `z.string().cuid()` (o job nunca aceita um payload
// malformado, nem em teste) — string com "_" (ex.: "order_1") falha o parse.
function fakeCuid(n: number): string {
  return `c${n.toString(36).padStart(24, "0")}`;
}

const logAuditMock = vi.fn(async () => undefined);
vi.mock("@/modules/audit/service", () => ({ logAudit: logAuditMock }));

function makeTx() {
  return {
    codLead: {
      create: vi.fn(async ({ data }: { data: { name: string; phone: string } }) => {
        const row = { id: fakeCuid(nextId++), ...data };
        codLeads.push(row);
        return row;
      }),
    },
    order: {
      create: vi.fn(async ({ data }: { data: Omit<FakeOrder, "orderNumber" | "total"> & { total: number } }) => {
        if (orders.some((o) => o.idempotencyKey === data.idempotencyKey)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.19.3",
          });
        }
        const row: FakeOrder = {
          ...data,
          id: fakeCuid(nextId++),
          orderNumber: orderNumberSeq++,
          total: new Prisma.Decimal(data.total),
        } as FakeOrder;
        orders.push(row);
        return row;
      }),
    },
    orderItem: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
        orderItems.push(...data);
        return { count: data.length };
      }),
    },
    orderStatusHistory: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        statusHistory.push(data);
        return data;
      }),
    },
    backgroundJob: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        backgroundJobs.push(data);
        return { id: fakeCuid(nextId++), ...(data as object) };
      }),
    },
  };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    funnel: {
      findUnique: vi.fn(async ({ where }: { where: { publicId: string } }) =>
        funnels.find((f) => f.id === where.publicId) ?? null
      ),
    },
    funnelVersion: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; funnelId: string } }) =>
        versions.find((v) => v.id === where.id && v.funnelId === where.funnelId) ?? null
      ),
    },
    shopifyStore: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => stores.find((s) => s.id === where.id) ?? null),
    },
    order: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        orders.find((o) => o.idempotencyKey === where.idempotencyKey) ?? null
      ),
    },
    $transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      return callback(makeTx());
    }),
  },
}));

const { submitCheckout } = await import("./service");

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
function paymentStep(allowCod = true) {
  return {
    id: "payment",
    type: "PAYMENT_CHOICE" as const,
    enabled: true,
    order: 2,
    config: { allowCod, allowOnlinePayment: true, codLabel: "COD", onlinePaymentLabel: "Online" },
  };
}
function codFormStep(required: Array<"NAME" | "PHONE" | "COUNTRY" | "STATE" | "CITY" | "ADDRESS"> = [
  "NAME",
  "PHONE",
  "COUNTRY",
  "STATE",
  "CITY",
  "ADDRESS",
]) {
  return {
    id: "cod-form",
    type: "COD_FORM" as const,
    enabled: true,
    order: 3,
    config: {
      fields: required.map((key) => ({ key, enabled: true, required: true })),
      submitButtonText: "Enviar",
    },
  };
}
function offerStep() {
  return {
    id: "offer",
    type: "OFFER" as const,
    enabled: true,
    order: 4,
    config: { offers: [{ id: "o1", quantity: 1, label: "1x" }, { id: "o2", quantity: 3, label: "3x" }] },
  };
}

function baseConfig(steps: unknown[]) {
  return { schemaVersion: 1, theme, steps, settings: {} };
}

const validCustomer = {
  name: "Maria Silva",
  phone: "+57 300 000 0000",
  country: "CO",
  state: "Antioquia",
  city: "Medellín",
  address: "Calle 123",
};

function seedPublishedFunnel(overrides: { steps?: unknown[] } = {}) {
  const funnel: FakeFunnel = {
    id: "funnel_1",
    workspaceId: "ws_1",
    shopifyStoreId: "store_1",
    status: "PUBLISHED",
    publishedVersionId: "version_1",
  };
  const version: FakeVersion = {
    id: "version_1",
    funnelId: "funnel_1",
    configSchemaVersion: 1,
    config: baseConfig(overrides.steps ?? [productStep(), successStep(), paymentStep(), codFormStep()]),
    status: "PUBLISHED",
    supersededAt: null,
    productSnapshot: {
      title: "Produto X",
      featuredImageUrl: null,
      unitPrice: new Prisma.Decimal(100),
      compareAtPrice: null,
    },
  };
  funnels.push(funnel);
  versions.push(version);
  stores.push({ id: "store_1", currency: "COP" });
  return { funnel, version };
}

function baseInput(overrides: Partial<Parameters<typeof submitCheckout>[0]> = {}) {
  return {
    funnelPublicId: "funnel_1",
    funnelVersionId: "version_1",
    checkoutAttemptId: "attempt-1",
    selectedPaymentMethod: "COD" as const,
    customer: validCustomer,
    ...overrides,
  };
}

beforeEach(() => {
  funnels = [];
  versions = [];
  stores = [];
  orders = [];
  codLeads = [];
  orderItems = [];
  statusHistory = [];
  backgroundJobs = [];
  nextId = 1;
  orderNumberSeq = 1047;
  logAuditMock.mockClear();
});

describe("submitCheckout — autoridade do servidor", () => {
  it("cria o Order com o preço do snapshot, nunca de nada vindo do client", async () => {
    seedPublishedFunnel();
    const result = await submitCheckout(baseInput());

    // Nota: o mock de $transaction usa Prisma.Decimal em memória (sem
    // round-trip real pelo Postgres), então `.toString()` não preserva as
    // 2 casas fixas que a coluna `Decimal(12,2)` garante em produção —
    // comparamos o valor numérico, não a formatação exata da string.
    expect(Number(result.total)).toBe(100);
    expect(result.currency).toBe("COP");
    // Nada no input tem campo de preço — a única fonte é productSnapshot.unitPrice.
    expect("total" in baseInput()).toBe(false);
    expect("price" in baseInput()).toBe(false);
  });

  it("rejeita funil inexistente", async () => {
    await expect(submitCheckout(baseInput({ funnelPublicId: "not-found" }))).rejects.toThrow();
  });

  it("rejeita funil em DRAFT (nunca publicado)", async () => {
    seedPublishedFunnel();
    funnels[0].status = "DRAFT";
    funnels[0].publishedVersionId = null;
    await expect(submitCheckout(baseInput())).rejects.toThrow();
  });

  it("rejeita funil ARCHIVED", async () => {
    seedPublishedFunnel();
    funnels[0].status = "ARCHIVED";
    await expect(submitCheckout(baseInput())).rejects.toThrow();
  });

  it("rejeita funnelVersionId que não pertence ao funil / não é elegível", async () => {
    seedPublishedFunnel();
    versions[0].status = "SUPERSEDED";
    versions[0].supersededAt = new Date(Date.now() - 60 * 60 * 1000); // 1h atrás, fora da janela
    await expect(submitCheckout(baseInput())).rejects.toThrow();
  });

  it("rejeita quando allowCod=false no PAYMENT_CHOICE publicado", async () => {
    seedPublishedFunnel({ steps: [productStep(), successStep(), paymentStep(false), codFormStep()] });
    await expect(submitCheckout(baseInput())).rejects.toThrow();
  });

  it("rejeita selectedPaymentMethod=ONLINE (não finaliza transação real ainda)", async () => {
    seedPublishedFunnel();
    await expect(submitCheckout(baseInput({ selectedPaymentMethod: "ONLINE" }))).rejects.toThrow();
    expect(orders).toHaveLength(0);
  });

  it("rejeita oferta inválida (não configurada no funil)", async () => {
    seedPublishedFunnel({ steps: [productStep(), successStep(), paymentStep(), codFormStep(), offerStep()] });
    await expect(submitCheckout(baseInput({ selectedOfferId: "does-not-exist" }))).rejects.toThrow();
  });

  it("ignora selectedQuantity do client — quantidade vem sempre da oferta configurada no servidor", async () => {
    seedPublishedFunnel({ steps: [productStep(), successStep(), paymentStep(), codFormStep(), offerStep()] });
    const result = await submitCheckout(
      baseInput({ selectedOfferId: "o2", selectedQuantity: 999 as never })
    );
    // Oferta o2 tem quantity=3 real — 999 do client nunca é usado.
    expect(Number(result.total)).toBe(300);
  });

  it("exige campo COD obrigatório do config publicado, mesmo se o client omitir", async () => {
    seedPublishedFunnel();
    const incompleteCustomer: Partial<typeof validCustomer> = { ...validCustomer };
    delete incompleteCustomer.address;
    await expect(submitCheckout(baseInput({ customer: incompleteCustomer }))).rejects.toThrow();
  });

  it("resposta pública nunca inclui codLeadId, workspaceId ou id interno do Order", async () => {
    seedPublishedFunnel();
    const result = await submitCheckout(baseInput());
    expect(result).not.toHaveProperty("codLeadId");
    expect(result).not.toHaveProperty("workspaceId");
    expect(result).not.toHaveProperty("id");
    expect(Object.keys(result).sort()).toEqual(["currency", "orderNumber", "publicOrderId", "status", "total"]);
  });
});

describe("submitCheckout — idempotência e transação", () => {
  it("mesmo checkoutAttemptId nunca cria um segundo Order", async () => {
    seedPublishedFunnel();
    const first = await submitCheckout(baseInput());
    const second = await submitCheckout(baseInput());

    expect(first.publicOrderId).toBe(second.publicOrderId);
    expect(orders).toHaveLength(1);
  });

  it("checkoutAttemptId diferente cria um Order separado", async () => {
    seedPublishedFunnel();
    const first = await submitCheckout(baseInput({ checkoutAttemptId: "attempt-a" }));
    const second = await submitCheckout(baseInput({ checkoutAttemptId: "attempt-b" }));

    expect(first.publicOrderId).not.toBe(second.publicOrderId);
    expect(orders).toHaveLength(2);
  });

  it("corrida real (P2002 na constraint) nunca duplica — o perdedor recebe o Order do vencedor", async () => {
    seedPublishedFunnel();
    // Simula a corrida: já existe uma linha com a mesma idempotencyKey no
    // banco no momento em que a segunda chamada tenta o INSERT, mas o
    // fast-path (findUnique) da segunda chamada não a viu a tempo — o tx
    // mock já lança P2002 quando encontra a chave duplicada.
    await submitCheckout(baseInput());
    const raceResult = await submitCheckout(baseInput());
    expect(orders).toHaveLength(1);
    expect(raceResult.publicOrderId).toBe(orders[0].publicOrderId);
  });

  it("cria CodLead + Order + OrderItem + OrderStatusHistory + BackgroundJob na mesma transação (atomicidade)", async () => {
    seedPublishedFunnel();
    await submitCheckout(baseInput());

    expect(codLeads).toHaveLength(1);
    expect(orders).toHaveLength(1);
    expect(orderItems).toHaveLength(1);
    expect(statusHistory).toHaveLength(1);
    expect(backgroundJobs).toHaveLength(1);
  });

  it("o job enfileirado é SHOPIFY_ORDER_CREATE com payload minimalista — só orderId, nunca PII", async () => {
    seedPublishedFunnel();
    await submitCheckout(baseInput());

    expect(backgroundJobs[0]).toMatchObject({ type: "SHOPIFY_ORDER_CREATE" });
    const payload = (backgroundJobs[0] as { payload: unknown }).payload;
    expect(Object.keys(payload as object)).toEqual(["orderId"]);
    expect(JSON.stringify(payload)).not.toMatch(/Maria|300 000 0000|Calle 123/);
  });

  it("OrderItem grava snapshot do título/preço, não uma referência viva ao Product", async () => {
    seedPublishedFunnel();
    await submitCheckout(baseInput());

    expect(orderItems[0]).toMatchObject({ titleSnapshot: "Produto X", unitPrice: 100, quantity: 1 });
  });
});
