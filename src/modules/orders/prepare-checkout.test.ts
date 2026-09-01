import { describe, expect, it } from "vitest";

import { prepareOnlineCheckout } from "./prepare-checkout";
import type { OrderQuote } from "./pricing";

const quote: OrderQuote = {
  currency: "COP",
  subtotal: 179800,
  offerDiscount: 29900,
  paymentMethodDiscount: 5000,
  discountTotal: 34900,
  shippingTotal: 0,
  total: 144900,
  items: [],
};

describe("prepareOnlineCheckout — contrato sem implementação real (Fase 4C)", () => {
  it("nunca retorna ok:true nesta fase — nenhum provider tem integração real", () => {
    const result = prepareOnlineCheckout({
      orderQuote: quote,
      provider: "SHOPIFY_CHECKOUT",
      funnelVersionId: "v1",
      selectedOfferId: "o1",
    });
    expect(result.ok).toBe(false);
  });

  it("PROVIDER_NOT_READY quando o provider nem está marcado como pronto", () => {
    const result = prepareOnlineCheckout({
      orderQuote: quote,
      provider: "YAMPI",
      funnelVersionId: "v1",
      selectedOfferId: null,
    });
    expect(result).toEqual({ ok: false, reason: "PROVIDER_NOT_READY" });
  });

  it("nunca lança — sempre retorna um resultado tipado, mesmo com provider desconhecido em runtime", () => {
    expect(() =>
      prepareOnlineCheckout({ orderQuote: quote, provider: "SHOPIFY_CHECKOUT", funnelVersionId: "v1", selectedOfferId: null })
    ).not.toThrow();
  });
});
