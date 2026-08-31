import { afterEach, describe, expect, it, vi } from "vitest";

import { createPreviewToken, verifyPreviewToken } from "./preview-token";

describe("preview token (autorização de preview)", () => {
  it("token recém-criado é válido e carrega funnelId/versionId", () => {
    const token = createPreviewToken("funnel_1", "version_1");
    const payload = verifyPreviewToken(token);
    expect(payload).toEqual(
      expect.objectContaining({ funnelId: "funnel_1", versionId: "version_1" })
    );
  });

  it("rejeita token adulterado (payload alterado sem reassinar)", () => {
    const token = createPreviewToken("funnel_1", "version_1");
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ funnelId: "funnel_2", versionId: "version_1", exp: Date.now() + 60_000 })
    ).toString("base64url");
    expect(verifyPreviewToken(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it("rejeita assinatura de outro token colada em payload diferente", () => {
    const tokenA = createPreviewToken("funnel_a", "version_a");
    const tokenB = createPreviewToken("funnel_b", "version_b");
    const [payloadA] = tokenA.split(".");
    const [, signatureB] = tokenB.split(".");
    expect(verifyPreviewToken(`${payloadA}.${signatureB}`)).toBeNull();
  });

  it("rejeita token malformado", () => {
    expect(verifyPreviewToken("not-a-token")).toBeNull();
    expect(verifyPreviewToken("")).toBeNull();
  });

  it("expira após o TTL", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const token = createPreviewToken("funnel_1", "version_1");
    expect(verifyPreviewToken(token)).not.toBeNull();

    vi.setSystemTime(new Date(now.getTime() + 16 * 60 * 1000)); // 16 min depois (TTL é 15 min)
    expect(verifyPreviewToken(token)).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
