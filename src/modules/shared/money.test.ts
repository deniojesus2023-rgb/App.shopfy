import { describe, expect, it } from "vitest";

import { compareMoney, formatMoney, formatMoneyForDisplay, multiplyMoney, roundMoney } from "./money";

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

describe("multiplyMoney", () => {
  it("multiplica e arredonda em centavos", () => {
    expect(multiplyMoney(19.9, 3)).toBe(59.7);
    expect(multiplyMoney(89900, 2)).toBe(179800);
  });
});

describe("compareMoney", () => {
  it("compara valores arredondados em centavos", () => {
    expect(compareMoney(100, 100)).toBe(0);
    expect(compareMoney(100, 99.99)).toBe(1);
    expect(compareMoney(99.99, 100)).toBe(-1);
  });

  it("trata diferenças abaixo de 1 centavo como iguais (ruído de float)", () => {
    expect(compareMoney(0.1 + 0.2, 0.3)).toBe(0);
  });
});

describe("formatMoneyForDisplay — não assume 2 casas para toda moeda", () => {
  it("moedas com 2 casas (COP, BRL, MXN, PEN, ARS, USD)", () => {
    expect(formatMoneyForDisplay(89900, "COP")).toBe("89900.00");
    expect(formatMoneyForDisplay(10.5, "BRL")).toBe("10.50");
  });

  it("moeda zero-decimal (CLP) nunca mostra casas decimais", () => {
    expect(formatMoneyForDisplay(89900, "CLP")).toBe("89900");
    expect(formatMoneyForDisplay(89900.7, "CLP")).toBe("89901");
  });

  it("moeda desconhecida cai no fallback de 2 casas, nunca lança", () => {
    expect(formatMoneyForDisplay(100, "XYZ")).toBe("100.00");
  });

  it("é case-insensitive na moeda", () => {
    expect(formatMoneyForDisplay(100, "clp")).toBe("100");
  });
});
