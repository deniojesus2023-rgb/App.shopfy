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
 * Único ponto de verdade sobre "este provider já tem integração real
 * funcionando". Público (Storefront) só pode expor/selecionar um método
 * cujo provider passe aqui — fail closed (spec item 20): nenhum botão de
 * checkout quebrado nunca chega ao consumidor final. Builder/preview pode
 * mostrar providers não-ready (com badge "No conectado") — a distinção
 * entre "visível no preview" e "disponível ao público" nunca é a mesma
 * checagem.
 */
export function isCheckoutProviderReady(provider: CheckoutProvider): boolean {
  return provider === "INTERNAL_COD";
}
