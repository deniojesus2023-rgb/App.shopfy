import { describe, expect, it } from "vitest";

import {
  findOnlineCheckoutIdentity,
  ONLINE_CHECKOUT_ATTRIBUTE_KEY,
  onlineCheckoutIdentity,
  parseOnlineCheckoutIdentity,
} from "./online-checkout-identity";

describe("onlineCheckoutIdentity", () => {
  it("é namespaced e round-trip com o parser", () => {
    const value = onlineCheckoutIdentity("attempt_123");
    expect(value).toBe("appshopfy_checkout_attempt_123");
    expect(parseOnlineCheckoutIdentity(value)).toBe("attempt_123");
  });

  it("nunca carrega PII — só o id opaco da tentativa", () => {
    const value = onlineCheckoutIdentity("cktest0001");
    expect(value).not.toMatch(/name|phone|address|whatsapp|@/i);
  });

  it("rejeita valores de outra integração (sem o nosso prefixo)", () => {
    expect(parseOnlineCheckoutIdentity("outro_app_checkout_1")).toBeNull();
    expect(parseOnlineCheckoutIdentity("appshopfy_order_abc")).toBeNull();
    expect(parseOnlineCheckoutIdentity(null)).toBeNull();
    expect(parseOnlineCheckoutIdentity("")).toBeNull();
  });

  it("rejeita o prefixo sem id", () => {
    expect(parseOnlineCheckoutIdentity("appshopfy_checkout_")).toBeNull();
  });
});

describe("findOnlineCheckoutIdentity — note attributes do webhook", () => {
  it("encontra a identidade na chave dedicada", () => {
    const attempt = findOnlineCheckoutIdentity([
      { name: "outro", value: "irrelevante" },
      { name: ONLINE_CHECKOUT_ATTRIBUTE_KEY, value: "appshopfy_checkout_a1" },
    ]);
    expect(attempt).toBe("a1");
  });

  it("aceita a identidade sob outra chave, desde que o VALOR tenha o nosso prefixo", () => {
    expect(findOnlineCheckoutIdentity([{ name: "renomeado", value: "appshopfy_checkout_a2" }])).toBe("a2");
  });

  it("nunca aceita um valor sem o nosso prefixo, mesmo na chave certa", () => {
    expect(findOnlineCheckoutIdentity([{ name: ONLINE_CHECKOUT_ATTRIBUTE_KEY, value: "qualquer-coisa" }])).toBeNull();
  });

  it("tolera lista vazia/ausente sem lançar", () => {
    expect(findOnlineCheckoutIdentity([])).toBeNull();
    expect(findOnlineCheckoutIdentity(null)).toBeNull();
    expect(findOnlineCheckoutIdentity(undefined)).toBeNull();
  });
});
