import { describe, expect, it } from "vitest";

import { roleAtLeast, roleHasPermission } from "./permissions";

describe("RBAC — funnels:*", () => {
  it("OWNER tem todas as permissões de funnels", () => {
    for (const permission of [
      "funnels:view",
      "funnels:create",
      "funnels:edit",
      "funnels:publish",
      "funnels:archive",
    ] as const) {
      expect(roleHasPermission("OWNER", permission)).toBe(true);
    }
  });

  it("ADMIN tem view/create/edit/publish, mas não archive", () => {
    expect(roleHasPermission("ADMIN", "funnels:view")).toBe(true);
    expect(roleHasPermission("ADMIN", "funnels:create")).toBe(true);
    expect(roleHasPermission("ADMIN", "funnels:edit")).toBe(true);
    expect(roleHasPermission("ADMIN", "funnels:publish")).toBe(true);
    expect(roleHasPermission("ADMIN", "funnels:archive")).toBe(false);
  });

  it("MEMBER só tem view", () => {
    expect(roleHasPermission("MEMBER", "funnels:view")).toBe(true);
    expect(roleHasPermission("MEMBER", "funnels:create")).toBe(false);
    expect(roleHasPermission("MEMBER", "funnels:edit")).toBe(false);
    expect(roleHasPermission("MEMBER", "funnels:publish")).toBe(false);
    expect(roleHasPermission("MEMBER", "funnels:archive")).toBe(false);
  });
});

describe("roleAtLeast", () => {
  it("OWNER >= ADMIN >= MEMBER", () => {
    expect(roleAtLeast("OWNER", "MEMBER")).toBe(true);
    expect(roleAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(roleAtLeast("ADMIN", "OWNER")).toBe(false);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
  });
});
