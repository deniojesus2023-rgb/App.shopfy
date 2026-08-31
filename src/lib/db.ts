import { PrismaClient } from "@prisma/client";

// Singleton do Prisma Client. Em dev, o Next recarrega módulos a cada
// mudança de arquivo — sem isso cada reload abriria uma nova pool de
// conexões contra o Postgres.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
