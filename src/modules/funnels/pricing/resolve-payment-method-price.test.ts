import { describe, expect, it } from "vitest";

import { resolvePaymentMethodPrice } from "./resolve-payment-method-price";

describe("resolvePaymentMethodPrice — NONE", () => {
  it("não altera o total", () => {
    const resolved = resolvePaymentMethodPrice(149900, { type: "NONE" });
    expect(resolved).toEqual({ baseTotal: 149900, discount: 0, total: 149900 });
  });
});

describe("resolvePaymentMethodPrice — FIXED_DISCOUNT", () => {
  it("subtrai o valor fixo do total da oferta", () => {
    const resolved = resolvePaymentMethodPrice(149900, { type: "FIXED_DISCOUNT", amount: 5000 });
    expect(resolved).toEqual({ baseTotal: 149900, discount: 5000, total: 144900 });
  });

  it("desconto igual ao total: total exatamente zero (o caller decide fail closed)", () => {
    const resolved = resolvePaymentMethodPrice(100, { type: "FIXED_DISCOUNT", amount: 100 });
    expect(resolved.total).toBe(0);
  });

  it("desconto maior que o total: total negativo (o caller decide fail closed, nunca clamp silencioso aqui)", () => {
    const resolved = resolvePaymentMethodPrice(100, { type: "FIXED_DISCOUNT", amount: 150 });
    expect(resolved.total).toBe(-50);
  });
});

describe("resolvePaymentMethodPrice — PERCENT_DISCOUNT", () => {
  it("calcula o percentual sobre o total da oferta, com roundMoney (nunca float cru)", () => {
    const resolved = resolvePaymentMethodPrice(149900, { type: "PERCENT_DISCOUNT", percent: 5 });
    expect(resolved.discount).toBe(7495);
    expect(resolved.total).toBe(142405);
  });

  it("100% de desconto: total exatamente zero", () => {
    const resolved = resolvePaymentMethodPrice(89900, { type: "PERCENT_DISCOUNT", percent: 100 });
    expect(resolved.total).toBe(0);
  });

  it("arredondamento não deixa vazar erro de ponto flutuante", () => {
    const resolved = resolvePaymentMethodPrice(19.9, { type: "PERCENT_DISCOUNT", percent: 33.33 });
    expect(Number.isFinite(resolved.discount)).toBe(true);
    expect(Math.round(resolved.discount * 100) / 100).toBe(resolved.discount);
  });
});

describe("resolvePaymentMethodPrice — nunca duplica o desconto da oferta", () => {
  it("incide sobre offerTotal (já com FIXED_TOTAL aplicado), nunca sobre um valor de referência maior", () => {
    // Simula: referência 179.800, oferta FIXED_TOTAL 149.900 (já resolvida
    // em outro lugar) — aqui só entra o total FINAL da oferta.
    const resolved = resolvePaymentMethodPrice(149900, { type: "FIXED_DISCOUNT", amount: 5000 });
    expect(resolved.baseTotal).toBe(149900);
    expect(resolved.total).toBe(144900);
  });
});
