import { describe, expect, it } from "vitest";

import { migrateFunnelConfig } from "./migrate";

describe("migrateFunnelConfig (contrato)", () => {
  it("fromVersion === toVersion retorna o config inalterado", () => {
    const config = { schemaVersion: 1, foo: "bar" };
    expect(migrateFunnelConfig(1, 1, config)).toBe(config);
  });

  it("lança ao tentar downgrade (fromVersion > toVersion)", () => {
    expect(() => migrateFunnelConfig(2, 1, {})).toThrow();
  });

  it("lança quando não existe migração registrada para o salto pedido", () => {
    expect(() => migrateFunnelConfig(1, 2, {})).toThrow();
  });
});
