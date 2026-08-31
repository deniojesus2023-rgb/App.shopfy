import { describe, expect, it } from "vitest";

import { isVersionEligibleForCheckout, VERSION_RACE_GRACE_MS } from "./version-window";

const now = new Date("2026-01-01T12:00:00Z");

describe("isVersionEligibleForCheckout", () => {
  it("aceita a versão PUBLISHED atual", () => {
    expect(
      isVersionEligibleForCheckout({ funnelId: "f1", status: "PUBLISHED", supersededAt: null }, "f1", now)
    ).toBe(true);
  });

  it("aceita SUPERSEDED dentro da janela de graça", () => {
    const supersededAt = new Date(now.getTime() - VERSION_RACE_GRACE_MS / 2);
    expect(isVersionEligibleForCheckout({ funnelId: "f1", status: "SUPERSEDED", supersededAt }, "f1", now)).toBe(
      true
    );
  });

  it("rejeita SUPERSEDED fora da janela de graça (não fica comprável indefinidamente)", () => {
    const supersededAt = new Date(now.getTime() - VERSION_RACE_GRACE_MS - 1);
    expect(isVersionEligibleForCheckout({ funnelId: "f1", status: "SUPERSEDED", supersededAt }, "f1", now)).toBe(
      false
    );
  });

  it("rejeita DRAFT mesmo que o config seja válido", () => {
    expect(isVersionEligibleForCheckout({ funnelId: "f1", status: "DRAFT", supersededAt: null }, "f1", now)).toBe(
      false
    );
  });

  it("rejeita versão de outro funil", () => {
    expect(
      isVersionEligibleForCheckout({ funnelId: "f2", status: "PUBLISHED", supersededAt: null }, "f1", now)
    ).toBe(false);
  });

  it("rejeita SUPERSEDED sem supersededAt (dado inconsistente — fail closed)", () => {
    expect(
      isVersionEligibleForCheckout({ funnelId: "f1", status: "SUPERSEDED", supersededAt: null }, "f1", now)
    ).toBe(false);
  });
});
