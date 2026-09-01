import { isCheckoutProviderReady } from "../config/checkout-provider";
import type { PaymentMethodConfig } from "../config/steps";

export interface PaymentMethodWarning {
  path: string;
  message: string;
}

/**
 * Avisos NÃO-bloqueantes, só para o Builder (spec Fase 4C item 25) —
 * nunca usado por semantic-validation.ts. "Provider ainda não conectado"
 * é o caso central: não impede salvar/publicar o draft (o lojista pode
 * estar preparando a config antes de a integração existir), mas o
 * Storefront público nunca expõe esse método enquanto o aviso for
 * verdade (ver checkout-provider.ts/isCheckoutProviderReady).
 */
export function computePaymentMethodWarnings(paymentMethods: PaymentMethodConfig[]): PaymentMethodWarning[] {
  const warnings: PaymentMethodWarning[] = [];

  for (const method of paymentMethods) {
    if (method.enabled && !isCheckoutProviderReady(method.provider)) {
      warnings.push({
        path: `paymentMethods.${method.id}.provider`,
        message: `"${method.label || method.id}" usa o provider ${method.provider}, que ainda não está conectado — não será exibido no storefront público até isso mudar.`,
      });
    }
  }

  return warnings;
}
