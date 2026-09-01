/**
 * Escopos mínimos pedidos ao lojista na Fase 1A. Cada um mapeado para a
 * necessidade concreta que já está no roadmap aprovado — nada de "pode ser
 * útil depois":
 *
 * - read_products    → Fase 1B (importação de catálogo). Pedido já agora
 *                       para não forçar o lojista a reautorizar o app duas
 *                       vezes em sequência.
 * - read_orders       → acompanhar pedidos existentes na loja (reconciliação
 *                       via webhook orders/updated).
 * - write_orders      → criar o pedido na Shopify a partir do fluxo COD
 *                       (Fase 3).
 * - read_fulfillments → status de envio/entrega (Fase 3, fulfillments/create).
 * - write_draft_orders → checkout ONLINE via draftOrderCreate + invoiceUrl
 *                       (Fase 4D). Não pedimos read_draft_orders à parte:
 *                       um write_* scope já inclui leitura do mesmo
 *                       recurso, e é só o que `findDraftOrdersByIdentity`
 *                       (reconciliação por tag) precisa.
 *
 * Deliberadamente fora de escopo aqui: write_products, read_customers,
 * write_customers, qualquer escopo de billing/checkout. Adicionar exige
 * decisão explícita e nova revisão de segurança.
 */
export const SHOPIFY_SCOPES = [
  "read_products",
  "read_orders",
  "write_orders",
  "read_fulfillments",
  "write_draft_orders",
] as const;

export const SHOPIFY_SCOPES_STRING = SHOPIFY_SCOPES.join(",");
