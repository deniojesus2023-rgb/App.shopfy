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
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL deve ser uma URL válida")
    .default("http://localhost:3000"),

  // Shopify — App Client (criado em partners.shopify.com), usado no OAuth.
  SHOPIFY_API_KEY: z.string().min(1, "SHOPIFY_API_KEY é obrigatório"),
  SHOPIFY_API_SECRET: z.string().min(1, "SHOPIFY_API_SECRET é obrigatório"),
  // Chave AES-256 em base64 (32 bytes decodificados) para criptografar
  // access tokens em repouso. Gerar com: openssl rand -base64 32
  SHOPIFY_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "SHOPIFY_TOKEN_ENCRYPTION_KEY é obrigatório")
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "SHOPIFY_TOKEN_ENCRYPTION_KEY deve decodificar para 32 bytes (openssl rand -base64 32)"
    ),

  // Protege /api/cron/process-jobs — o cron da Vercel envia
  // `Authorization: Bearer <CRON_SECRET>` automaticamente quando esta env
  // var está configurada no projeto. Gerar com: openssl rand -hex 32
  CRON_SECRET: z.string().min(1, "CRON_SECRET é obrigatório"),

  // Assina o token de preview de rascunho de funil (/f/preview/[token]).
  // Gerar com: openssl rand -hex 32
  FUNNEL_PREVIEW_SECRET: z.string().min(1, "FUNNEL_PREVIEW_SECRET é obrigatório"),

  // Interruptor explícito para o worker SHOPIFY_ORDER_CREATE realmente
  // chamar a Shopify (Fase 3). Default "false" deliberado: nunca queremos
  // que rodar `npm run dev`/testes locais crie um pedido real na Shopify
  // por acidente. Produção precisa setar "true" explicitamente.
  SHOPIFY_ORDER_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Interruptor do checkout ONLINE via Draft Order + invoiceUrl (Fase 4D).
  // Default "false" deliberado: a integração existe mas NÃO é considerada
  // pronta até ser validada numa development store (ver checklist no
  // README). Enquanto for false, `SHOPIFY_CHECKOUT` nunca fica ready e o
  // storefront público nem exibe o método — nenhum consumidor final chega
  // num checkout não validado por acidente.
  SHOPIFY_ONLINE_CHECKOUT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
  SHOPIFY_TOKEN_ENCRYPTION_KEY: process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  FUNNEL_PREVIEW_SECRET: process.env.FUNNEL_PREVIEW_SECRET,
  SHOPIFY_ORDER_SYNC_ENABLED: process.env.SHOPIFY_ORDER_SYNC_ENABLED,
  SHOPIFY_ONLINE_CHECKOUT_ENABLED: process.env.SHOPIFY_ONLINE_CHECKOUT_ENABLED,
});
