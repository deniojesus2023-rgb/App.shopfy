/**
 * Contrato de migração de config entre versões de schema. Hoje só existe a
 * v1, então `MIGRATIONS` está vazio e todo caminho relevante é o
 * `fromVersion === toVersion` (retorna o config como está). A infra existe
 * desde já para quando uma v2 aparecer: basta registrar `MIGRATIONS[1] =
 * migrateV1ToV2` — nenhum outro código precisa mudar.
 */
type ConfigMigration = (config: unknown) => unknown;

const MIGRATIONS: Record<number, ConfigMigration> = {};

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
