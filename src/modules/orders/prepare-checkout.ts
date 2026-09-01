import type { CheckoutProvider } from "../funnels/config/checkout-provider";
import { isCheckoutProviderReady } from "../funnels/config/checkout-provider";
import type { OrderQuote } from "./pricing";

/**
 * Contrato futuro (spec Fase 4C item 17) — NENHUMA implementação real
 * nesta fase. Existe só para fixar, desde já, o formato de entrada que a
 * integração de checkout online vai precisar: o Quote server-authoritative
 * inteiro (não um preço solto), porque o catálogo Shopify/Yampi pode estar
 * em 89.900×2=179.800 enquanto o preço combinado (oferta FIXED_TOTAL +
 * desconto de pagamento) é 144.900 — simplesmente redirecionar para um
 * checkout externo sem carregar esse Quote perderia os dois ajustes.
 *
 * Não decide AGORA se a integração futura vai usar cart, checkout/cart
 * permalink, discount, draft order ou outra estratégia — isso exige
 * validação contra documentação oficial (Shopify) e, para a Yampi,
 * documentação que este projeto não tem acesso verificado ainda (spec
 * item 15/16). Escolher uma estratégia aqui seria inventar.
 */
export interface PrepareOnlineCheckoutInput {
  orderQuote: OrderQuote;
  provider: CheckoutProvider;
  funnelVersionId: string;
  selectedOfferId: string | null;
}

export type PrepareOnlineCheckoutResult =
  | { ok: false; reason: "PROVIDER_NOT_READY" }
  | { ok: false; reason: "NOT_IMPLEMENTED" };

/**
 * SEMPRE retorna `ok:false` nesta fase — não existe nenhum caminho de
 * sucesso ainda. `PROVIDER_NOT_READY` quando o provider nem está marcado
 * como pronto (`isCheckoutProviderReady`); `NOT_IMPLEMENTED` quando o
 * provider está pronto mas a integração real (redirect, criação de
 * checkout externo) segue não implementada — hoje `isCheckoutProviderReady`
 * nunca retorna `true` para `SHOPIFY_CHECKOUT`/`YAMPI`, então esse segundo
 * ramo é só o contrato para quando isso mudar.
 */
export function prepareOnlineCheckout(input: PrepareOnlineCheckoutInput): PrepareOnlineCheckoutResult {
  if (!isCheckoutProviderReady(input.provider)) {
    return { ok: false, reason: "PROVIDER_NOT_READY" };
  }
  return { ok: false, reason: "NOT_IMPLEMENTED" };
}
