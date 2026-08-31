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
  selectedPaymentMethod: z.enum(["COD", "ONLINE"]),
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

export interface SubmitCheckoutResponse {
  publicOrderId: string;
  orderNumber: number;
  status: string;
  total: string;
  currency: string;
}
