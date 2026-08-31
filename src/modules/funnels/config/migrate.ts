import type { FunnelConfigV1, FunnelConfigV2 } from "./schema";
import type { FunnelStep } from "./steps";

/**
 * Contrato de migração de config entre versões de schema. `migrateV1ToV2`
 * (Fase 4A) é a primeira migração real registrada aqui — usa de verdade a
 * infra desenhada na Fase 2A, que até então só existia como placeholder.
 *
 * Regra de migração (spec Fase 4A item 7): toda oferta v1 (sem `pricing`)
 * vira `UNIT_MULTIPLIER` — é exatamente o comportamento que ela já tinha
 * antes desta fase (unitPrice × quantity), então nenhum funil existente
 * muda de preço ao ser migrado em memória.
 */
function migrateV1ToV2(config: unknown): unknown {
  const v1 = config as FunnelConfigV1;
  return {
    ...v1,
    schemaVersion: 2,
    steps: v1.steps.map((step): FunnelStep => {
      if (step.type !== "OFFER") return step as FunnelStep;
      return {
        ...step,
        config: {
          offers: step.config.offers.map((offer) => ({
            ...offer,
            pricing: { type: "UNIT_MULTIPLIER" as const },
          })),
        },
      };
    }),
  } satisfies FunnelConfigV2;
}

type ConfigMigration = (config: unknown) => unknown;

const MIGRATIONS: Record<number, ConfigMigration> = {
  1: migrateV1ToV2,
};

export function migrateFunnelConfig(
  fromVersion: number,
  toVersion: number,
  config: unknown
): unknown {
  if (fromVersion === toVersion) {
    return config;
  }
  if (fromVersion > toVersion) {
    throw new Error(
      `Downgrade de config schema não suportado (v${fromVersion} -> v${toVersion}).`
    );
  }

  let current = config;
  for (let version = fromVersion; version < toVersion; version++) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Não existe migração registrada de v${version} para v${version + 1}.`);
    }
    current = migration(current);
  }
  return current;
}
