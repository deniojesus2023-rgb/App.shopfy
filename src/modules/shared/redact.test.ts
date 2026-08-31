import { describe, expect, it } from "vitest";

import { redactOrderFields } from "./redact";

describe("redactOrderFields", () => {
  it("mantém só os campos da allowlist", () => {
    const result = redactOrderFields({ orderId: "o1", status: "PENDING", workspaceId: "w1" });
    expect(result).toEqual({
      orderId: "o1",
      publicOrderId: undefined,
      orderNumber: undefined,
      workspaceId: "w1",
      shopifyStoreId: undefined,
      funnelId: undefined,
      status: "PENDING",
      shopifySyncStatus: undefined,
      shopifyOrderId: undefined,
      jobId: undefined,
      errorCode: undefined,
      durationMs: undefined,
    });
  });

  it("dropa silenciosamente qualquer campo de PII que alguém tenha colocado no objeto por engano", () => {
    // Sem anotação de tipo de propósito: simula um call site que
    // erroneamente incluiu PII no objeto passado — TS não bloqueia isso
    // (checagem de propriedade excedente só vale para literais passados
    // direto na chamada), então a defesa real precisa vir da allowlist
    // em runtime, que é exatamente o que este teste comprova.
    const withPii = {
      orderId: "o1",
      name: "Maria Silva",
      phone: "+57 300 000 0000",
      address: "Calle 123",
    };
    const result = redactOrderFields(withPii);
    expect(JSON.stringify(result)).not.toMatch(/Maria|300 000 0000|Calle 123/);
  });
});
