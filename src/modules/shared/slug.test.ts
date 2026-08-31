import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("normaliza espaços, acentos e maiúsculas", () => {
    expect(slugify("Mini Aspiradora Pro!")).toBe("mini-aspiradora-pro");
    expect(slugify("Ação Promoção")).toBe("acao-promocao");
  });

  it("colapsa hífens repetidos e remove das bordas", () => {
    expect(slugify("  --Produto---Legal--  ")).toBe("produto-legal");
  });

  it("remove caracteres não alfanuméricos", () => {
    expect(slugify("50% OFF: Compre já!!!")).toBe("50-off-compre-ja");
  });

  it("string vazia ou só símbolos vira string vazia", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
