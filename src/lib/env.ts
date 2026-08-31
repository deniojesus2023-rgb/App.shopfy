import { z } from "zod";

// Validação centralizada das variáveis de ambiente. Falha rápido e alto no
// boot do processo em vez de um `undefined` silencioso surgir três camadas
// depois dentro de uma Server Action.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY é obrigatório"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY é obrigatório"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
});
