import { z } from "zod";

/**
 * Quem executa o checkout — conceito INDEPENDENTE de `PaymentMethod`
 * (como o cliente pretende pagar) e de `PaymentMethodPricing` (efeito
 * comercial daquele método). Nunca misturar os três (spec Fase 4C item 2).
 *
 * `INTERNAL_COD` é o único provider com integração real nesta fase.
 * `SHOPIFY_CHECKOUT`/`YAMPI` existem só como CONFIGURAÇÃO — nenhuma
 * integração real, nenhum redirect, nenhuma suposição sobre endpoint/
 * payload/webhook de nenhum dos dois (spec item 15/16: sem documentação
 * oficial verificada, não inventar).
 */
export const checkoutProviderSchema = z.enum(["INTERNAL_COD", "SHOPIFY_CHECKOUT", "YAMPI"]);

export type CheckoutProvider = z.infer<typeof checkoutProviderSchema>;

/**
 * Contexto de readiness — calculado SEMPRE no servidor (lê feature flag e
 * estado da loja) e passado adiante como dado serializável, nunca lido de
 * dentro de um componente client. Mesmo padrão da moeda na Fase 4A: a
 * função abaixo continua pura, a autoridade continua server-side.
 */
export interface CheckoutReadinessContext {
  /** `SHOPIFY_ONLINE_CHECKOUT_ENABLED` — ver lib/env.ts. */
  onlineCheckoutEnabled: boolean;
  /** Loja Shopify efetivamente conectada (token utilizável). */
  storeConnected: boolean;
}

/** Nenhum provider externo pronto — default seguro para preview/testes. */
export const NO_ONLINE_CHECKOUT_READINESS: CheckoutReadinessContext = {
  onlineCheckoutEnabled: false,
  storeConnected: false,
};

/**
 * Único ponto de verdade sobre "este provider já tem integração real
 * funcionando". Público (Storefront) só pode expor/selecionar um método
 * cujo provider passe aqui — fail closed: nenhum botão de checkout
 * quebrado nunca chega ao consumidor final. Builder/preview pode mostrar
 * providers não-ready (com badge "No conectado") — a distinção entre
 * "visível no preview" e "disponível ao público" nunca é a mesma checagem.
 *
 * `SHOPIFY_CHECKOUT` (Fase 4D) exige as DUAS condições: a feature flag
 * ligada explicitamente E a loja conectada. `YAMPI` continua sem nenhuma
 * integração — nunca fica ready.
 */
export function isCheckoutProviderReady(
  provider: CheckoutProvider,
  context: CheckoutReadinessContext = NO_ONLINE_CHECKOUT_READINESS
): boolean {
  switch (provider) {
    case "INTERNAL_COD":
      return true;
    case "SHOPIFY_CHECKOUT":
      return context.onlineCheckoutEnabled && context.storeConnected;
    case "YAMPI":
      return false;
  }
}
