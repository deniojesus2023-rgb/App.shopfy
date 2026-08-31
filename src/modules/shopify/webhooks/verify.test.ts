import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyOAuthCallbackHmac, verifyWebhookHmac } from "./verify";

// Mesmo valor configurado em vitest.config.ts (SHOPIFY_API_SECRET).
const API_SECRET = "test_api_secret";

function signWebhookBody(rawBody: string) {
  return crypto.createHmac("sha256", API_SECRET).update(rawBody, "utf8").digest("base64");
}

describe("verifyWebhookHmac", () => {
  it("aceita uma assinatura válida sobre o corpo raw exato", () => {
    const rawBody = JSON.stringify({ id: 123, topic: "orders/create" });
    const hmac = signWebhookBody(rawBody);
    expect(verifyWebhookHmac(rawBody, hmac)).toBe(true);
  });

  it("rejeita quando o corpo foi alterado após a assinatura", () => {
    const rawBody = JSON.stringify({ id: 123 });
    const hmac = signWebhookBody(rawBody);
    const tamperedBody = JSON.stringify({ id: 456 });
    expect(verifyWebhookHmac(tamperedBody, hmac)).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(verifyWebhookHmac("{}", null)).toBe(false);
  });

  it("rejeita assinatura de outro segredo", () => {
    const rawBody = "{}";
    const wrongHmac = crypto
      .createHmac("sha256", "outro_segredo_qualquer")
      .update(rawBody, "utf8")
      .digest("base64");
    expect(verifyWebhookHmac(rawBody, wrongHmac)).toBe(false);
  });
});

describe("verifyOAuthCallbackHmac", () => {
  function sign(params: Record<string, string>) {
    const pairs = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .sort();
    return crypto
      .createHmac("sha256", API_SECRET)
      .update(pairs.join("&"), "utf8")
      .digest("hex");
  }

  it("aceita hmac válido calculado sobre os params ordenados", () => {
    const base = { shop: "loja.myshopify.com", code: "abc123", state: "xyz", timestamp: "1000" };
    const hmac = sign(base);
    const search = new URLSearchParams({ ...base, hmac });
    expect(verifyOAuthCallbackHmac(search)).toBe(true);
  });

  it("rejeita se um parâmetro foi alterado após a assinatura", () => {
    const base = { shop: "loja.myshopify.com", code: "abc123", state: "xyz", timestamp: "1000" };
    const hmac = sign(base);
    const search = new URLSearchParams({ ...base, code: "outro-code", hmac });
    expect(verifyOAuthCallbackHmac(search)).toBe(false);
  });

  it("ignora `hmac` e `signature` no cálculo, não apenas no header", () => {
    const base = { shop: "loja.myshopify.com", state: "xyz" };
    const hmac = sign(base);
    // Um atacante não consegue "esconder" um parâmetro extra sob o nome
    // `signature` para escapar da verificação.
    const search = new URLSearchParams({ ...base, signature: "ignored", hmac });
    expect(verifyOAuthCallbackHmac(search)).toBe(true);
  });

  it("rejeita quando não há parâmetro hmac", () => {
    const search = new URLSearchParams({ shop: "loja.myshopify.com" });
    expect(verifyOAuthCallbackHmac(search)).toBe(false);
  });
});
