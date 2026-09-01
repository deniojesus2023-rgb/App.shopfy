import type { z } from "zod";

import { ValidationError } from "@/modules/shared/errors";
import { migrateFunnelConfig } from "./migrate";
import { funnelConfigV1Schema, funnelConfigV2Schema, funnelConfigV3Schema, type FunnelConfig } from "./schema";

function parseWithSchema<T extends z.ZodType>(schema: T, config: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new ValidationError(
      `Config inválido (${label}): ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return result.data;
}

/**
 * Ponto único de leitura do config JSON de uma FunnelVersion — nenhum
 * outro módulo deve acessar `funnelVersion.config` sem passar por aqui
 * primeiro (o JSON no banco é `Json` sem tipagem própria do Postgres).
 *
 * Sempre devolve o shape ATUAL (`FunnelConfig` = V2), mesmo quando a linha
 * no banco é v1 histórica: migra em memória, nunca reescreve o banco por
 * conta própria (isso é responsabilidade explícita de quem grava — ver
 * `updateDraftConfig`/`publishFunnel`). Uma FunnelVersion PUBLISHED antiga
 * nunca é tocada, mas todo código consumidor (storefront, builder,
 * validação semântica) sempre enxerga o shape corrente.
 */
export function parseFunnelConfig(configSchemaVersion: number, config: unknown): FunnelConfig {
  if (configSchemaVersion === 3) {
    return parseWithSchema(funnelConfigV3Schema, config, "v3");
  }

  if (configSchemaVersion === 2) {
    const v2 = parseWithSchema(funnelConfigV2Schema, config, "v2");
    const migrated = migrateFunnelConfig(2, 3, v2);
    // Defesa em profundidade: a migração deve produzir V3 válido sempre —
    // revalidar aqui pega qualquer regressão futura na função de migração
    // antes que ela vaze para o resto da aplicação.
    return parseWithSchema(funnelConfigV3Schema, migrated, "v2->v3 migrado");
  }

  if (configSchemaVersion === 1) {
    const v1 = parseWithSchema(funnelConfigV1Schema, config, "v1");
    // `migrateFunnelConfig` encadeia 1->2->3 sozinho — cada passo já é
    // testado isoladamente em migrate.test.ts.
    const migrated = migrateFunnelConfig(1, 3, v1);
    return parseWithSchema(funnelConfigV3Schema, migrated, "v1->v3 migrado");
  }

  throw new ValidationError(`configSchemaVersion ${configSchemaVersion} não é suportado.`);
}
