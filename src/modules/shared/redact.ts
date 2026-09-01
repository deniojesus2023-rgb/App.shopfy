/**
 * A partir da Fase 3 armazenamos PII de verdade (CodLead: nome, telefone,
 * endereço). Esta é a única função que qualquer código deve chamar antes de
 * logar/auditar algo relacionado a um pedido — força uma allowlist em vez
 * de confiar que quem escreve o `console.error`/`logAudit` de plantão vai
 * lembrar de nunca incluir o objeto inteiro.
 *
 * Nunca importar CodLead/nome/telefone/endereço diretamente em log/auditoria/
 * payload de fila/URL — sempre passar por aqui (ou por um subconjunto ainda
 * menor definido no call site).
 */
export interface SafeOrderLogFields {
  orderId?: string;
  /** Tentativa de checkout ONLINE (Fase 4D) — id opaco, nunca PII. */
  onlineCheckoutAttemptId?: string;
  publicOrderId?: string;
  orderNumber?: number;
  workspaceId?: string;
  shopifyStoreId?: string;
  funnelId?: string;
  status?: string;
  shopifySyncStatus?: string;
  shopifyOrderId?: string;
  jobId?: string;
  errorCode?: string;
  durationMs?: number;
}

/**
 * Reduz qualquer objeto a só os campos da allowlist acima, dropando
 * silenciosamente tudo mais (inclusive um `name`/`phone`/`address` que
 * alguém tenha colocado no objeto por engano) — nunca lança para o campo
 * "faltar", porque isto é para logging best-effort, não validação.
 */
export function redactOrderFields(input: SafeOrderLogFields): SafeOrderLogFields {
  const {
    orderId,
    onlineCheckoutAttemptId,
    publicOrderId,
    orderNumber,
    workspaceId,
    shopifyStoreId,
    funnelId,
    status,
    shopifySyncStatus,
    shopifyOrderId,
    jobId,
    errorCode,
    durationMs,
  } = input;
  return {
    orderId,
    onlineCheckoutAttemptId,
    publicOrderId,
    orderNumber,
    workspaceId,
    shopifyStoreId,
    funnelId,
    status,
    shopifySyncStatus,
    shopifyOrderId,
    jobId,
    errorCode,
    durationMs,
  };
}
