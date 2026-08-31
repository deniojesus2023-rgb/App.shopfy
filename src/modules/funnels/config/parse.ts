import { ValidationError } from "@/modules/shared/errors";
import { funnelConfigV1Schema, type FunnelConfigV1 } from "./schema";

/**
 * Ponto único de leitura do config JSON de uma FunnelVersion — nenhum
 * outro módulo deve acessar `funnelVersion.config` sem passar por aqui
 * primeiro (o JSON no banco é `Json` sem tipagem própria do Postgres).
 */
export function parseFunnelConfig(configSchemaVersion: number, config: unknown): FunnelConfigV1 {
  if (configSchemaVersion === 1) {
    const result = funnelConfigV1Schema.safeParse(config);
    if (!result.success) {
      throw new ValidationError(
        `Config inválido para configSchemaVersion 1: ${result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      );
    }
    return result.data;
  }

  throw new ValidationError(`configSchemaVersion ${configSchemaVersion} não é suportado.`);
}
