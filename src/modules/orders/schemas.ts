import { z } from "zod";

// Mesmas regras de "texto seguro" usadas no resto do funil não se aplicam
// literalmente aqui (isto não é config de lojista, é dado de cliente final
// digitado num form), mas limites de tamanho e trim continuam obrigatórios
// — nunca aceitar string ilimitada de um endpoint público anônimo.
const customerFieldSchema = z.string().trim().min(1).max(200);

export const submitCheckoutSchema = z.object({
  funnelPublicId: z.string().min(1).max(64),
  funnelVersionId: z.string().cuid(),
  checkoutAttemptId: z.string().uuid(),
  // Só a identidade da oferta — nunca a quantidade (Fase 4A item 19/20): o
  // servidor deriva `quantity` da oferta publicada correspondente,
  // ignorando qualquer valor que o client pudesse enviar.
  selectedOfferId: z.string().max(64).optional(),
  // Só a identidade do método de pagamento — nunca method/provider/
  // desconto vindos do client (Fase 4C item 10): o servidor resolve tudo
  // isso a partir do config publicado. Sem etapa PAYMENT_CHOICE habilitada,
  // o servidor sintetiza um método COD/INTERNAL_COD default (mesmo padrão
  // já usado para selectedOfferId sem etapa OFFER).
  selectedPaymentMethodId: z.string().max(64).optional(),
  customer: z.object({
    name: customerFieldSchema.optional(),
    phone: customerFieldSchema.optional(),
    whatsapp: customerFieldSchema.optional(),
    country: customerFieldSchema.optional(),
    state: customerFieldSchema.optional(),
    city: customerFieldSchema.optional(),
    address: customerFieldSchema.optional(),
    addressReference: customerFieldSchema.optional(),
  }),
  // Honeypot: nunca visível/preenchível por um humano no form real. Só bots
  // que preenchem todo campo do DOM tendem a mandar isto não-vazio.
  website: z.string().max(200).optional(),
});

export type SubmitCheckoutInput = z.infer<typeof submitCheckoutSchema>;

/**
 * Início de checkout ONLINE (Fase 4D). Deliberadamente NÃO aceita nenhum
 * campo financeiro nem de cliente: preço/desconto/total vêm do
 * `calculateOrderQuote` no servidor, e nome/endereço são preenchidos
 * dentro do checkout da Shopify — o funil não coleta PII no fluxo ONLINE.
 */
export const startOnlineCheckoutSchema = z.object({
  funnelPublicId: z.string().min(1).max(64),
  funnelVersionId: z.string().cuid(),
  checkoutAttemptId: z.string().uuid(),
  selectedOfferId: z.string().max(64).optional(),
  selectedPaymentMethodId: z.string().max(64),
});

export type StartOnlineCheckoutInput = z.infer<typeof startOnlineCheckoutSchema>;

export interface StartOnlineCheckoutResponse {
  /** `DraftOrder.invoiceUrl` — nunca IDs internos. */
  checkoutUrl: string;
}

export interface SubmitCheckoutResponse {
  publicOrderId: string;
  orderNumber: number;
  status: string;
  total: string;
  currency: string;
}
