import type { FunnelConfigV1, FunnelConfigV2, FunnelConfigV3, FunnelConfigV4 } from "./schema";
import type { FunnelStep, FunnelStepV2, FunnelStepV3 } from "./steps";

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
    steps: v2.steps.map((step): FunnelStepV3 => {
      if (step.type !== "REWARD") return step as FunnelStepV3;
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

/**
 * Regra de migração (spec Fase 4C item 9): `allowCod=true` vira um método
 * COD/INTERNAL_COD/`pricing:NONE` — comportamento idêntico ao anterior
 * (nenhuma regra de preço por pagamento existia antes desta fase).
 * `allowOnlinePayment=true` vira um método ONLINE com `provider:
 * SHOPIFY_CHECKOUT` (valor estruturalmente válido — a regra "ONLINE exige
 * SHOPIFY_CHECKOUT ou YAMPI" tem que ser satisfeita por ALGUM valor
 * concreto) e `enabled` preservando o valor antigo de `allowOnlinePayment`.
 *
 * Decisão deliberada (nunca escolher um provider "de verdade" na
 * migração): a visibilidade PÚBLICA de um método não depende mais só de
 * `enabled` — depende de `enabled && isCheckoutProviderReady(provider)`
 * (checkout-provider.ts). Como `SHOPIFY_CHECKOUT` é hardcoded "not ready"
 * nesta fase inteira, o resultado prático é IDÊNTICO ao comportamento
 * anterior (ONLINE nunca funcionava de verdade no público — antes era
 * rejeitado no servidor após seleção, agora simplesmente não aparece) —
 * só que pela razão certa, e sem a migração precisar "ativar" nada.
 */
function migrateV3ToV4(config: unknown): unknown {
  const v3 = config as FunnelConfigV3;
  return {
    ...v3,
    schemaVersion: 4,
    steps: v3.steps.map((step): FunnelStep => {
      if (step.type !== "PAYMENT_CHOICE") return step as FunnelStep;
      const paymentMethods = [];
      if (step.config.allowCod) {
        paymentMethods.push({
          id: "cod",
          method: "COD" as const,
          provider: "INTERNAL_COD" as const,
          enabled: true,
          label: step.config.codLabel,
          description: step.config.codDescription,
          pricing: { type: "NONE" as const },
        });
      }
      if (step.config.allowOnlinePayment) {
        paymentMethods.push({
          id: "online",
          method: "ONLINE" as const,
          provider: "SHOPIFY_CHECKOUT" as const,
          enabled: true,
          label: step.config.onlinePaymentLabel,
          description: step.config.onlinePaymentDescription,
          pricing: { type: "NONE" as const },
        });
      }
      const recommendedMethodId =
        step.config.recommendedMethod === "COD"
          ? "cod"
          : step.config.recommendedMethod === "ONLINE"
            ? "online"
            : undefined;
      return { ...step, config: { paymentMethods, recommendedMethodId } };
    }),
  } satisfies FunnelConfigV4;
}

type ConfigMigration = (config: unknown) => unknown;

const MIGRATIONS: Record<number, ConfigMigration> = {
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
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
