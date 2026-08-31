import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://user:password@localhost:5432/app_shopfy_test",
      CLERK_SECRET_KEY: "sk_test_dummy",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dummy",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      SHOPIFY_API_KEY: "test_api_key",
      SHOPIFY_API_SECRET: "test_api_secret",
      // Chave fixa e sem valor real — apenas para os testes decodificarem
      // 32 bytes válidos e exercitarem o round-trip de encrypt/decrypt.
      SHOPIFY_TOKEN_ENCRYPTION_KEY: "DQYDyk/ywNVI9ARyJzzZ0WsLHOIEi/9YXDeZButXFmo=",
      CRON_SECRET: "test_cron_secret",
      FUNNEL_PREVIEW_SECRET: "test_funnel_preview_secret",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
