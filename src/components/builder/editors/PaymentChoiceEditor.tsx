"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentChoiceStepConfig } from "@/modules/funnels/config/steps";

export function PaymentChoiceEditor({
  config,
  onChange,
}: {
  config: PaymentChoiceStepConfig;
  onChange: (config: PaymentChoiceStepConfig) => void;
}) {
  function update(patch: Partial<PaymentChoiceStepConfig>) {
    onChange({ ...config, ...patch });
  }

  // Pelo menos um método precisa continuar ativo — desabilita o checkbox
  // do único método ligado em vez de deixar o usuário chegar num estado
  // que o Zod (allowCod || allowOnlinePayment) vai rejeitar ao salvar.
  const onlyCodActive = config.allowCod && !config.allowOnlinePayment;
  const onlyOnlineActive = config.allowOnlinePayment && !config.allowCod;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={config.allowCod}
            disabled={onlyCodActive}
            onChange={(e) => {
              const allowCod = e.target.checked;
              update({
                allowCod,
                recommendedMethod: config.recommendedMethod === "COD" && !allowCod ? undefined : config.recommendedMethod,
              });
            }}
          />
          Pago contra entrega
        </label>
        {onlyCodActive && (
          <p className="text-xs text-neutral-500">Pelo menos um método de pagamento precisa continuar ativo.</p>
        )}

        {config.allowCod && (
          <div className="flex flex-col gap-3 pl-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codLabel">Rótulo</Label>
              <Input id="codLabel" value={config.codLabel} maxLength={80} onChange={(e) => update({ codLabel: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codDescription">Descrição</Label>
              <Input
                id="codDescription"
                value={config.codDescription ?? ""}
                maxLength={300}
                onChange={(e) => update({ codDescription: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recommended"
                checked={config.recommendedMethod === "COD"}
                onChange={() => update({ recommendedMethod: "COD" })}
              />
              Marcar como recomendado
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={config.allowOnlinePayment}
            disabled={onlyOnlineActive}
            onChange={(e) => {
              const allowOnlinePayment = e.target.checked;
              update({
                allowOnlinePayment,
                recommendedMethod:
                  config.recommendedMethod === "ONLINE" && !allowOnlinePayment ? undefined : config.recommendedMethod,
              });
            }}
          />
          Pago en línea
        </label>
        {onlyOnlineActive && (
          <p className="text-xs text-neutral-500">Pelo menos um método de pagamento precisa continuar ativo.</p>
        )}

        {config.allowOnlinePayment && (
          <div className="flex flex-col gap-3 pl-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onlineLabel">Rótulo</Label>
              <Input
                id="onlineLabel"
                value={config.onlinePaymentLabel}
                maxLength={80}
                onChange={(e) => update({ onlinePaymentLabel: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onlineDescription">Descrição</Label>
              <Input
                id="onlineDescription"
                value={config.onlinePaymentDescription ?? ""}
                maxLength={300}
                onChange={(e) => update({ onlinePaymentDescription: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onlineDiscount">Selo de desconto (opcional)</Label>
              <Input
                id="onlineDiscount"
                value={config.onlinePaymentDiscountDisplay ?? ""}
                maxLength={80}
                onChange={(e) => update({ onlinePaymentDiscountDisplay: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="recommended"
                checked={config.recommendedMethod === "ONLINE"}
                onChange={() => update({ recommendedMethod: "ONLINE" })}
              />
              Marcar como recomendado
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
