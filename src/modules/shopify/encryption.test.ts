import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./encryption";

describe("encryptToken / decryptToken", () => {
  it("faz round-trip do texto original", () => {
    const plaintext = "shpat_abcdef1234567890";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("nunca armazena o texto em claro no payload criptografado", () => {
    const plaintext = "shpat_super_secret_token";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  it("gera IV diferente a cada chamada (ciphertext não determinístico)", () => {
    const plaintext = "shpat_abcdef1234567890";
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(plaintext);
    expect(decryptToken(b)).toBe(plaintext);
  });

  it("é prefixado com a versão do formato", () => {
    expect(encryptToken("x").startsWith("v1.")).toBe(true);
  });

  it("rejeita payload com tag de autenticação adulterada", () => {
    const encrypted = encryptToken("shpat_abcdef1234567890");
    const [version, iv, tag, data] = encrypted.split(".");
    const tampered = [version, iv, tag.slice(0, -2) + "aa", data].join(".");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejeita payload com formato desconhecido", () => {
    expect(() => decryptToken("not-a-valid-payload")).toThrow();
    expect(() => decryptToken("v2.a.b.c")).toThrow();
  });
});
