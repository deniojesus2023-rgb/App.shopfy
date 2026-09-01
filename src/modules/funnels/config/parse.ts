import type { z } from "zod";

import { ValidationError } from "@/modules/shared/errors";
import { migrateFunnelConfig } from "./migrate";
import {
  funnelConfigV1Schema,
  funnelConfigV2Schema,
  funnelConfigV3Schema,
  funnelConfigV4Schema,
  type FunnelConfig,
} from "./schema";

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
 * Sempre devolve o shape ATUAL (`FunnelConfig` = V4), mesmo quando a linha
 * no banco é histórica: migra em memória, nunca reescreve o banco por
 * conta própria (isso é responsabilidade explícita de quem grava — ver
 * `updateDraftConfig`/`publishFunnel`). Uma FunnelVersion PUBLISHED antiga
 * nunca é tocada, mas todo código consumidor (storefront, builder,
 * validação semântica) sempre enxerga o shape corrente.
 */
export function parseFunnelConfig(configSchemaVersion: number, config: unknown): FunnelConfig {
  if (configSchemaVersion === 4) {
    return parseWithSchema(funnelConfigV4Schema, config, "v4");
  }

  if (configSchemaVersion === 3) {
    const v3 = parseWithSchema(funnelConfigV3Schema, config, "v3");
    const migrated = migrateFunnelConfig(3, 4, v3);
    // Defesa em profundidade: a migração deve produzir V4 válido sempre —
    // revalidar aqui pega qualquer regressão futura na função de migração
    // antes que ela vaze para o resto da aplicação.
    return parseWithSchema(funnelConfigV4Schema, migrated, "v3->v4 migrado");
  }

  if (configSchemaVersion === 2) {
    const v2 = parseWithSchema(funnelConfigV2Schema, config, "v2");
    // `migrateFunnelConfig` encadeia 2->3->4 sozinho — cada passo já é
    // testado isoladamente em migrate.test.ts.
    const migrated = migrateFunnelConfig(2, 4, v2);
    return parseWithSchema(funnelConfigV4Schema, migrated, "v2->v4 migrado");
  }

  if (configSchemaVersion === 1) {
    const v1 = parseWithSchema(funnelConfigV1Schema, config, "v1");
    const migrated = migrateFunnelConfig(1, 4, v1);
    return parseWithSchema(funnelConfigV4Schema, migrated, "v1->v4 migrado");
  }

  throw new ValidationError(`configSchemaVersion ${configSchemaVersion} não é suportado.`);
}
