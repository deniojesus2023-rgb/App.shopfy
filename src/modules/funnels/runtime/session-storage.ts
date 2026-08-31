import { z } from "zod";

import type { RuntimeState } from "./state";

// Validação leve do que volta do sessionStorage — nunca confiar em JSON
// vindo de storage do navegador sem checar forma. Nenhum campo de PII
// (nome/telefone/endereço do formulário COD) existe aqui por design: esses
// dados vivem só em memória do componente do formulário.
const runtimeStateSchema = z.object({
  sessionId: z.string(),
  funnelId: z.string(),
  funnelVersionId: z.string(),
  currentStepId: z.string(),
  completedStepIds: z.array(z.string()),
  selectedOfferId: z.string().nullable(),
  selectedQuantity: z.number().nullable(),
  selectedPaymentMethod: z.enum(["COD", "ONLINE"]).nullable(),
  rewardProgress: z.number(),
  rewardUnlocked: z.boolean(),
  upsellAccepted: z.boolean().nullable(),
  checkoutAttemptId: z.string(),
  lastOrder: z
    .object({
      publicOrderId: z.string(),
      orderNumber: z.number(),
      status: z.string(),
      total: z.string(),
      currency: z.string(),
    })
    .nullable(),
});

function storageKey(funnelId: string): string {
  return `funnel_session:${funnelId}`;
}

/**
 * Restaura a sessão salva só se o `funnelVersionId` bater com a versão
 * publicada atual — nunca mistura estado (etapa atual, oferta escolhida)
 * de uma versão do funil com o config de outra. Qualquer falha (storage
 * indisponível, JSON corrompido, versão divergente) retorna `null`
 * silenciosamente: o caller sempre sabe criar uma sessão nova.
 */
export function readRuntimeSession(funnelId: string, funnelVersionId: string): RuntimeState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(funnelId));
    if (!raw) return null;

    const parsed = runtimeStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.funnelVersionId !== funnelVersionId) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

export function writeRuntimeSession(state: RuntimeState): void {
  try {
    sessionStorage.setItem(storageKey(state.funnelId), JSON.stringify(state));
  } catch {
    // Storage indisponível (modo privado, quota) — degrada para "sem
    // resume", não é motivo para quebrar a experiência.
  }
}

export function clearRuntimeSession(funnelId: string): void {
  try {
    sessionStorage.removeItem(storageKey(funnelId));
  } catch {
    // idem
  }
}
