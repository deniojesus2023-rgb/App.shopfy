import { describe, expect, it } from "vitest";

import { buildShopifyLineItems, distributeLineTotal, projectedTotalCents } from "./shopify-line-items";

function item(overrides: Partial<Parameters<typeof buildShopifyLineItems>[0][number]> = {}) {
  return {
    titleSnapshot: "Produto X",
    shopifyVariantId: "gid://shopify/ProductVariant/1",
    quantity: 1,
    lineTotal: 89900,
    ...overrides,
  };
}

/** Soma das quantidades FÍSICAS projetadas. */
function totalQuantity(lineItems: ReturnType<typeof buildShopifyLineItems>): number {
  return lineItems.reduce((sum, li) => sum + li.quantity, 0);
}

describe("distributeLineTotal — casos divisíveis", () => {
  it("UNIT_MULTIPLIER (2 × 89.900) sai como UMA linha de quantidade 2, sem split desnecessário", () => {
    const groups = distributeLineTotal(179800, 2);
    expect(groups).toEqual([{ quantity: 2, unitPriceCents: 8990000 }]);
  });

  it("FIXED_TOTAL divisível (149.900 em 2 unidades) também sai como UMA linha", () => {
    const groups = distributeLineTotal(149900, 2);
    expect(groups).toEqual([{ quantity: 2, unitPriceCents: 7495000 }]);
  });

  it("quantidade 1 sempre sai como uma linha com o total inteiro", () => {
    expect(distributeLineTotal(149900, 1)).toEqual([{ quantity: 1, unitPriceCents: 14990000 }]);
  });
});

describe("distributeLineTotal — casos NÃO divisíveis", () => {
  it("149.900 em 3 unidades distribui os centavos e preserva total e quantidade", () => {
    const groups = distributeLineTotal(149900, 3);

    // 14.990.000 centavos / 3 = 4.996.666 com resto 2 → 2 unidades levam 1
    // centavo a mais.
    expect(groups).toEqual([
      { quantity: 2, unitPriceCents: 4996667 },
      { quantity: 1, unitPriceCents: 4996666 },
    ]);

    const quantity = groups.reduce((s, g) => s + g.quantity, 0);
    const cents = groups.reduce((s, g) => s + g.quantity * g.unitPriceCents, 0);
    expect(quantity).toBe(3);
    expect(cents).toBe(14990000);
  });

  it("nunca gera mais de dois grupos, por maior que seja a quantidade", () => {
    for (const quantity of [3, 6, 7, 11, 20]) {
      expect(distributeLineTotal(149900, quantity).length).toBeLessThanOrEqual(2);
    }
  });

  it("para qualquer quantidade, soma de centavos e quantidade física são exatas", () => {
    for (const quantity of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 17]) {
      for (const total of [149900, 89900, 199900, 0.03, 100.01, 1]) {
        const groups = distributeLineTotal(total, quantity);
        expect(groups.reduce((s, g) => s + g.quantity, 0)).toBe(quantity);
        expect(groups.reduce((s, g) => s + g.quantity * g.unitPriceCents, 0)).toBe(Math.round(total * 100));
      }
    }
  });

  it("ordem é determinística: o preço unitário maior sempre vem primeiro", () => {
    const groups = distributeLineTotal(149900, 3);
    expect(groups[0].unitPriceCents).toBeGreaterThan(groups[1].unitPriceCents);
    expect(distributeLineTotal(149900, 3)).toEqual(groups);
  });

  it("rejeita quantidade inválida em vez de produzir payload silenciosamente errado", () => {
    expect(() => distributeLineTotal(100, 0)).toThrow();
    expect(() => distributeLineTotal(100, -1)).toThrow();
    expect(() => distributeLineTotal(100, 1.5)).toThrow();
    expect(() => distributeLineTotal(-1, 1)).toThrow();
    expect(() => distributeLineTotal(Number.NaN, 1)).toThrow();
  });
});

describe("buildShopifyLineItems — semântica de quantidade", () => {
  it("bundle de 2 unidades preserva quantity=2 (nunca achata em 1)", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 2, lineTotal: 149900 })]);

    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].quantity).toBe(2);
    expect(lineItems[0].unitPrice).toBe("74950.00");
    expect(totalQuantity(lineItems)).toBe(2);
  });

  it("bundle de 3 unidades com total indivisível preserva quantidade física 3 e total exato", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 3, lineTotal: 149900 })]);

    expect(totalQuantity(lineItems)).toBe(3);
    expect(projectedTotalCents(lineItems)).toBe(14990000);
    expect(lineItems.map((li) => li.unitPrice)).toEqual(["49966.67", "49966.66"]);
    expect(lineItems.map((li) => li.quantity)).toEqual([2, 1]);
  });

  it("nenhum line item é gerado com quantity=1 quando a quantidade comercial é maior", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 4, lineTotal: 199900 })]);
    expect(totalQuantity(lineItems)).toBe(4);
    // O split, quando existe, nunca vira "tudo 1" — os grupos agregam unidades.
    expect(lineItems.length).toBeLessThanOrEqual(2);
  });

  it("vários OrderItem somam a quantidade física de todos", () => {
    const lineItems = buildShopifyLineItems([
      item({ quantity: 2, lineTotal: 149900 }),
      item({ quantity: 3, lineTotal: 149900, shopifyVariantId: "gid://shopify/ProductVariant/2" }),
    ]);

    expect(totalQuantity(lineItems)).toBe(5);
    expect(projectedTotalCents(lineItems)).toBe(29980000);
  });
});

describe("buildShopifyLineItems — identidade e título", () => {
  it("preserva o variantId real em todas as linhas do split", () => {
    const lineItems = buildShopifyLineItems([
      item({ quantity: 3, lineTotal: 149900, shopifyVariantId: "gid://shopify/ProductVariant/42" }),
    ]);

    expect(lineItems).toHaveLength(2);
    for (const li of lineItems) {
      expect(li.variantId).toBe("gid://shopify/ProductVariant/42");
    }
  });

  it("sem variante congelada (snapshot antigo), cai em custom line item mas mantém a quantidade real", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 3, lineTotal: 149900, shopifyVariantId: null })]);

    expect(lineItems.every((li) => li.variantId === null)).toBe(true);
    expect(totalQuantity(lineItems)).toBe(3);
    expect(projectedTotalCents(lineItems)).toBe(14990000);
  });

  it("o título NUNCA carrega quantidade — é apresentação pura", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 3, lineTotal: 149900 })]);

    for (const li of lineItems) {
      expect(li.title).toBe("Produto X");
      expect(li.title).not.toMatch(/\d\s*x/i);
    }
  });
});

describe("projectedTotalCents", () => {
  it("soma preço unitário × quantidade de cada linha", () => {
    const lineItems = buildShopifyLineItems([item({ quantity: 2, lineTotal: 179800 })]);
    expect(projectedTotalCents(lineItems)).toBe(17980000);
  });

  it("moedas zero-decimal continuam exatas na precisão de armazenamento (2 casas no fio, Fase 3)", () => {
    // CLP não usa centavos na apresentação, mas o armazenamento e o payload
    // são sempre 2 casas — a distribuição opera nessa precisão, então a
    // soma fecha exatamente do mesmo jeito.
    const lineItems = buildShopifyLineItems([item({ quantity: 3, lineTotal: 100000 })]);
    expect(totalQuantity(lineItems)).toBe(3);
    expect(projectedTotalCents(lineItems)).toBe(10000000);
  });
});
