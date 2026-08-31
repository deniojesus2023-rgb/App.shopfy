import path from "node:path";
import { defineConfig } from "prisma/config";

// Um `prisma.config.ts` presente desativa o auto-load de `.env` que o
// Prisma CLI fazia sozinho — carregamos explicitamente aqui, senão
// `prisma db push`/`migrate`/`studio` param de encontrar DATABASE_URL.
try {
  process.loadEnvFile();
} catch {
  // Sem .env no diretório (ex.: CI com env vars já exportadas) — ok ignorar.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
