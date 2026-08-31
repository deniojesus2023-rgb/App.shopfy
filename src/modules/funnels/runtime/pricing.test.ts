import { describe, expect, it } from "vitest";

import { computeOfferPrice, formatPrice } from "./pricing";

describe("computeOfferPrice", () => {
  it("multiplica preço unitário pela quantidade", () => {
    expect(computeOfferPrice(19.9, 1)).toBe(19.9);
    expect(computeOfferPrice(19.9, 3)).toBe(59.7);
  });

  it("arredonda em centavos (evita erro de ponto flutuante)", () => {
    expect(computeOfferPrice(0.1, 3)).toBe(0.3);
  });
});

describe("formatPrice", () => {
  it("sempre duas casas decimais, sem símbolo de moeda", () => {
    expect(formatPrice(10)).toBe("10.00");
    expect(formatPrice(9.999)).toBe("10.00");
    expect(formatPrice(0)).toBe("0.00");
  });
});
