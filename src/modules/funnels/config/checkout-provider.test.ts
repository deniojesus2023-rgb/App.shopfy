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
