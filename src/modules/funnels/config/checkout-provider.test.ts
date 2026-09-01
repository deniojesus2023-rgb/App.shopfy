import { describe, expect, it } from "vitest";

import { checkoutProviderSchema, isCheckoutProviderReady } from "./checkout-provider";

describe("checkoutProviderSchema", () => {
  it("aceita os 3 valores conhecidos", () => {
    expect(checkoutProviderSchema.safeParse("INTERNAL_COD").success).toBe(true);
    expect(checkoutProviderSchema.safeParse("SHOPIFY_CHECKOUT").success).toBe(true);
    expect(checkoutProviderSchema.safeParse("YAMPI").success).toBe(true);
  });

  it("rejeita provider desconhecido", () => {
    expect(checkoutProviderSchema.safeParse("STRIPE").success).toBe(false);
  });
});

describe("isCheckoutProviderReady", () => {
  it("INTERNAL_COD é o único provider ready nesta fase", () => {
    expect(isCheckoutProviderReady("INTERNAL_COD")).toBe(true);
  });

  it("SHOPIFY_CHECKOUT nunca é ready nesta fase (nenhuma integração real)", () => {
    expect(isCheckoutProviderReady("SHOPIFY_CHECKOUT")).toBe(false);
  });

  it("YAMPI nunca é ready nesta fase (nenhuma integração real)", () => {
    expect(isCheckoutProviderReady("YAMPI")).toBe(false);
  });
});

describe("isCheckoutProviderReady — contexto de readiness (Fase 4D)", () => {
  const ready = { onlineCheckoutEnabled: true, storeConnected: true };

  it("SHOPIFY_CHECKOUT exige as DUAS condições: flag ligada E loja conectada", () => {
    expect(isCheckoutProviderReady("SHOPIFY_CHECKOUT", ready)).toBe(true);
    expect(isCheckoutProviderReady("SHOPIFY_CHECKOUT", { onlineCheckoutEnabled: true, storeConnected: false })).toBe(false);
    expect(isCheckoutProviderReady("SHOPIFY_CHECKOUT", { onlineCheckoutEnabled: false, storeConnected: true })).toBe(false);
  });

  it("sem contexto explícito, o default é fail closed (nada online pronto)", () => {
    expect(isCheckoutProviderReady("SHOPIFY_CHECKOUT")).toBe(false);
  });

  it("YAMPI nunca fica ready, nem com a flag ligada e loja conectada", () => {
    expect(isCheckoutProviderReady("YAMPI", ready)).toBe(false);
  });

  it("INTERNAL_COD não depende de flag nenhuma", () => {
    expect(isCheckoutProviderReady("INTERNAL_COD", { onlineCheckoutEnabled: false, storeConnected: false })).toBe(true);
  });
});
