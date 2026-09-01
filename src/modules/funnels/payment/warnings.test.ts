import { describe, expect, it } from "vitest";

import type { PaymentMethodConfig } from "../config/steps";
import { computePaymentMethodWarnings } from "./warnings";

function method(overrides: Partial<PaymentMethodConfig> = {}): PaymentMethodConfig {
  return {
    id: "cod",
    method: "COD",
    provider: "INTERNAL_COD",
    enabled: true,
    label: "COD",
    pricing: { type: "NONE" },
    ...overrides,
  };
}

describe("computePaymentMethodWarnings — não bloqueante", () => {
  it("nenhum aviso quando todos os métodos habilitados usam provider ready", () => {
    const warnings = computePaymentMethodWarnings([method()]);
    expect(warnings).toEqual([]);
  });

  it("avisa quando um método HABILITADO usa provider não conectado (SHOPIFY_CHECKOUT)", () => {
    const warnings = computePaymentMethodWarnings([
      method({ id: "online", method: "ONLINE", provider: "SHOPIFY_CHECKOUT" }),
    ]);
    expect(warnings.length).toBe(1);
    expect(warnings[0].path).toContain("online");
  });

  it("avisa quando um método HABILITADO usa provider não conectado (YAMPI)", () => {
    const warnings = computePaymentMethodWarnings([method({ id: "online", method: "ONLINE", provider: "YAMPI" })]);
    expect(warnings.length).toBe(1);
  });

  it("método DESABILITADO com provider não conectado não gera aviso (não está exposto de qualquer forma)", () => {
    const warnings = computePaymentMethodWarnings([
      method({ id: "online", method: "ONLINE", provider: "SHOPIFY_CHECKOUT", enabled: false }),
    ]);
    expect(warnings).toEqual([]);
  });

  it("nunca bloqueia — só retorna avisos, o caller decide o que fazer", () => {
    expect(() =>
      computePaymentMethodWarnings([method({ id: "online", method: "ONLINE", provider: "YAMPI" })])
    ).not.toThrow();
  });
});
