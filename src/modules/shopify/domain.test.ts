import { describe, expect, it } from "vitest";

import { isValidShopDomain, normalizeShopDomain } from "./domain";

describe("normalizeShopDomain", () => {
  it("aceita apenas o handle da loja", () => {
    expect(normalizeShopDomain("minha-loja")).toBe("minha-loja.myshopify.com");
  });

  it("aceita o domínio completo já normalizado", () => {
    expect(normalizeShopDomain("minha-loja.myshopify.com")).toBe("minha-loja.myshopify.com");
  });

  it("aceita URL completa com protocolo e path", () => {
    expect(normalizeShopDomain("https://minha-loja.myshopify.com/admin")).toBe(
      "minha-loja.myshopify.com"
    );
  });

  it("normaliza para minúsculas e remove espaços nas bordas", () => {
    expect(normalizeShopDomain("  Minha-Loja.MyShopify.com  ")).toBe(
      "minha-loja.myshopify.com"
    );
  });

  it("rejeita string vazia", () => {
    expect(normalizeShopDomain("")).toBeNull();
    expect(normalizeShopDomain("   ")).toBeNull();
  });

  it("rejeita domínio de outro provedor", () => {
    expect(normalizeShopDomain("minha-loja.com")).toBeNull();
    expect(normalizeShopDomain("https://evil.com/minha-loja.myshopify.com")).toBeNull();
  });

  it("rejeita handle com caracteres inválidos", () => {
    expect(normalizeShopDomain("minha loja")).toBeNull();
    expect(normalizeShopDomain("minha_loja!")).toBeNull();
  });

  it("rejeita tentativa de path traversal / injeção de subdomínio", () => {
    expect(normalizeShopDomain("evil.com/../minha-loja.myshopify.com")).toBeNull();
  });
});

describe("isValidShopDomain", () => {
  it("aceita domínio canônico", () => {
    expect(isValidShopDomain("minha-loja.myshopify.com")).toBe(true);
  });

  it("rejeita domínio sem sufixo myshopify.com", () => {
    expect(isValidShopDomain("minha-loja.com")).toBe(false);
  });
});
