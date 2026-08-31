import { describe, expect, it } from "vitest";

import { orderSourceIdentifier, parseOrderSourceIdentifier } from "./shopify-identity";
import { internalOrderTag, parseInternalOrderTag } from "./shopify-tag";

describe("orderSourceIdentifier", () => {
  it("é derivado do Order.id, namespaced e estável", () => {
    const id = orderSourceIdentifier("corder00000000000000000001");
    expect(id).toBe("appshopfy_order_corder00000000000000000001");
    expect(orderSourceIdentifier("corder00000000000000000001")).toBe(id);
  });

  it("nunca carrega PII — só o cuid opaco do Order", () => {
    const id = orderSourceIdentifier("corder00000000000000000001");
    expect(id).not.toMatch(/@|\+\d|Maria|Calle/);
  });

  it("é seguro para a sintaxe de busca da Shopify (sem `:` nem espaço)", () => {
    expect(orderSourceIdentifier("corder1")).not.toMatch(/[:\s]/);
  });

  it("faz round-trip com parseOrderSourceIdentifier", () => {
    expect(parseOrderSourceIdentifier(orderSourceIdentifier("corder1"))).toBe("corder1");
  });

  it("ignora identificadores de outra origem (não colide com outra integração)", () => {
    expect(parseOrderSourceIdentifier("outro_app_order_123")).toBeNull();
    expect(parseOrderSourceIdentifier(null)).toBeNull();
    expect(parseOrderSourceIdentifier(undefined)).toBeNull();
    expect(parseOrderSourceIdentifier("appshopfy_order_")).toBeNull();
  });
});

describe("tag de apoio (nunca identidade)", () => {
  it("continua existindo, com prefixo próprio, independente do sourceIdentifier", () => {
    expect(internalOrderTag("corder1")).toBe("internal_order_corder1");
    expect(internalOrderTag("corder1")).not.toBe(orderSourceIdentifier("corder1"));
  });

  it("parse da tag segue disponível só como fallback de webhook", () => {
    expect(parseInternalOrderTag(["cod", "internal_order_corder1"])).toBe("corder1");
    expect(parseInternalOrderTag(["cod"])).toBeNull();
  });
});
