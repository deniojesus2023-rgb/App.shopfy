import { describe, expect, it } from "vitest";

import { formatMoney, roundMoney } from "./money";

describe("roundMoney", () => {
  it("arredonda em centavos, nunca deixa vazar erro de ponto flutuante", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(19.9 * 3)).toBe(59.7);
  });

  it("mantém valores já exatos inalterados", () => {
    expect(roundMoney(100)).toBe(100);
  });
});

describe("formatMoney", () => {
  it("sempre mostra 2 casas decimais", () => {
    expect(formatMoney(89900)).toBe("89900.00");
    expect(formatMoney(10.5)).toBe("10.50");
  });
});
