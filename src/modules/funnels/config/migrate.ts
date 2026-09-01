import type { FunnelConfigV1, FunnelConfigV2, FunnelConfigV3 } from "./schema";
import type { FunnelStep, FunnelStepV2 } from "./steps";

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
    steps: v1.steps.map((step): FunnelStepV2 => {
      if (step.type !== "OFFER") return step as FunnelStepV2;
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

/**
 * Regra de migração (spec Fase 4B item 6): todo REWARD v2 (texto/número
 * digitado, sem regra real) vira `STATIC_PROGRESS` com o MESMO
 * `baseProgress` que ele já mostrava (`initialProgress`) — o funil migrado
 * continua abrindo, navegando e criando pedido com o mesmo progresso
 * visual. O que NÃO migra é `rewardDisplayType`/`displayValue`: um texto
 * livre tipo "$36.000" nunca teve regra real por trás — perpetuá-lo na
 * migração seria manter exatamente o dark pattern que esta fase existe
 * para eliminar (spec: "comportamento equivalente SEGURO", "não inventar
 * reward financeiro em migration"). `subtitle`, quando presente, vira a
 * mensagem final — nenhum valor monetário é inventado.
 */
function migrateV2ToV3(config: unknown): unknown {
  const v2 = config as FunnelConfigV2;
  return {
    ...v2,
    schemaVersion: 3,
    steps: v2.steps.map((step): FunnelStep => {
      if (step.type !== "REWARD") return step as FunnelStep;
      return {
        ...step,
        config: {
          title: step.config.title,
          subtitle: step.config.subtitle,
          progressRule: { type: "STATIC_PROGRESS" as const, baseProgress: step.config.initialProgress },
          reward: {
            type: "MESSAGE_ONLY" as const,
            message: step.config.subtitle && step.config.subtitle.length > 0 ? step.config.subtitle : "Beneficio desbloqueado.",
          },
          milestones: [],
          showProgressBar: true,
          showRemainingValue: false,
          showCurrentValue: false,
          ctaText: step.config.ctaText,
          finalMessage: "Beneficio desbloqueado.",
        },
      };
    }),
  } satisfies FunnelConfigV3;
}

type ConfigMigration = (config: unknown) => unknown;

const MIGRATIONS: Record<number, ConfigMigration> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
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
