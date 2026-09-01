"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CheckoutProvider } from "@/modules/funnels/config/checkout-provider";
import { isCheckoutProviderReady } from "@/modules/funnels/config/checkout-provider";
import type { PaymentMethodPricing } from "@/modules/funnels/config/payment-method-pricing";
import type { PaymentChoiceStepConfig, PaymentMethodConfig } from "@/modules/funnels/config/steps";
import { computePaymentMethodWarnings } from "@/modules/funnels/payment/warnings";
import { resolvePaymentMethodPrice } from "@/modules/funnels/pricing/resolve-payment-method-price";
import { formatMoneyForDisplay } from "@/modules/shared/money";

const PROVIDER_LABELS: Record<CheckoutProvider, string> = {
  INTERNAL_COD: "Pago contra entrega interno",
  SHOPIFY_CHECKOUT: "Shopify Checkout",
  YAMPI: "Yampi",
};

const PRICING_TYPE_LABELS: Record<PaymentMethodPricing["type"], string> = {
  NONE: "Sin descuento",
  FIXED_DISCOUNT: "Descuento fijo",
  PERCENT_DISCOUNT: "Descuento porcentual",
};

function newMethodId() {
  return `payment-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultPricingFor(type: PaymentMethodPricing["type"]): PaymentMethodPricing {
  switch (type) {
    case "NONE":
      return { type: "NONE" };
    case "FIXED_DISCOUNT":
      return { type: "FIXED_DISCOUNT", amount: 0 };
    case "PERCENT_DISCOUNT":
      return { type: "PERCENT_DISCOUNT", percent: 5 };
  }
}

/**
 * Núcleo de precificação compartilhado (mesmo espírito de
 * OfferStepEditor): a mesma `resolvePaymentMethodPrice` usada aqui é usada
 * pelo storefront e pelo servidor — o Builder só mostra o resultado.
 * `sampleOfferTotal` é só um valor de exemplo para o preview local — nunca
 * o total real de um pedido, que só o servidor calcula.
 */
export function PaymentChoiceEditor({
  config,
  sampleOfferTotal,
  currency,
  onChange,
}: {
  config: PaymentChoiceStepConfig;
  /** Total de exemplo (ex.: preço da primeira oferta) só para o preview local. */
  sampleOfferTotal: number;
  currency: string;
  onChange: (config: PaymentChoiceStepConfig) => void;
}) {
  function updateMethod(index: number, patch: Partial<PaymentMethodConfig>) {
    const paymentMethods = [...config.paymentMethods];
    paymentMethods[index] = { ...paymentMethods[index], ...patch };
    onChange({ ...config, paymentMethods });
  }

  function toggleMethodType(method: "COD" | "ONLINE", enabled: boolean) {
    const existing = config.paymentMethods.find((m) => m.method === method);
    if (existing) {
      updateMethod(config.paymentMethods.indexOf(existing), { enabled });
      return;
    }
    if (!enabled) return;
    const created: PaymentMethodConfig =
      method === "COD"
        ? { id: newMethodId(), method: "COD", provider: "INTERNAL_COD", enabled: true, label: "Pagar al recibir", pricing: { type: "NONE" } }
        : { id: newMethodId(), method: "ONLINE", provider: "SHOPIFY_CHECKOUT", enabled: true, label: "Pagar ahora", pricing: { type: "NONE" } };
    onChange({ ...config, paymentMethods: [...config.paymentMethods, created] });
  }

  const codMethod = config.paymentMethods.find((m) => m.method === "COD");
  const onlineMethod = config.paymentMethods.find((m) => m.method === "ONLINE");
  const warnings = computePaymentMethodWarnings(config.paymentMethods);

  // Pelo menos um método precisa continuar ativo (mesma trava já usada em
  // OfferStepEditor/RewardStepEditor) — desabilita o checkbox do único
  // habilitado em vez de deixar o usuário chegar num estado que o Zod
  // (paymentMethods.some(enabled)) vai rejeitar ao salvar.
  const enabledCount = config.paymentMethods.filter((m) => m.enabled).length;
  const onlyCodActive = enabledCount === 1 && codMethod?.enabled === true;
  const onlyOnlineActive = enabledCount === 1 && onlineMethod?.enabled === true;

  function format(value: number) {
    return formatMoneyForDisplay(value, currency);
  }

  function renderMethodFields(method: PaymentMethodConfig) {
    const index = config.paymentMethods.indexOf(method);
    const resolved = resolvePaymentMethodPrice(sampleOfferTotal, method.pricing);
    const ready = isCheckoutProviderReady(method.provider);
    const providerOptions: CheckoutProvider[] = method.method === "COD" ? ["INTERNAL_COD"] : ["SHOPIFY_CHECKOUT", "YAMPI"];

    return (
      <div className="flex flex-col gap-3 pl-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`label-${method.id}`}>Rótulo</Label>
          <Input
            id={`label-${method.id}`}
            value={method.label}
            maxLength={80}
            onChange={(e) => updateMethod(index, { label: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`description-${method.id}`}>Descrição</Label>
          <Input
            id={`description-${method.id}`}
            value={method.description ?? ""}
            maxLength={300}
            onChange={(e) => updateMethod(index, { description: e.target.value })}
          />
        </div>

        {method.method === "ONLINE" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`provider-${method.id}`}>Proveedor</Label>
            <select
              id={`provider-${method.id}`}
              value={method.provider}
              onChange={(e) => updateMethod(index, { provider: e.target.value as CheckoutProvider })}
              className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              {providerOptions.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
            {!ready && <p className="text-xs text-amber-700">No conectado — no se mostrará en el storefront público todavía.</p>}
          </div>
        )}
        {method.method === "COD" && <p className="text-xs text-neutral-500">Proveedor: {PROVIDER_LABELS.INTERNAL_COD}</p>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pricing-type-${method.id}`}>
            {method.method === "COD" ? "Precio" : "Beneficio por pagar ahora"}
          </Label>
          <select
            id={`pricing-type-${method.id}`}
            value={method.pricing.type}
            onChange={(e) => updateMethod(index, { pricing: defaultPricingFor(e.target.value as PaymentMethodPricing["type"]) })}
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {Object.entries(PRICING_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {method.pricing.type === "FIXED_DISCOUNT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`fixed-amount-${method.id}`}>Valor del descuento</Label>
            <Input
              id={`fixed-amount-${method.id}`}
              type="number"
              min={0}
              step={0.01}
              value={method.pricing.amount}
              onChange={(e) =>
                updateMethod(index, { pricing: { type: "FIXED_DISCOUNT", amount: Math.max(0, Number(e.target.value)) } })
              }
            />
          </div>
        )}
        {method.pricing.type === "PERCENT_DISCOUNT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`percent-${method.id}`}>Porcentaje de descuento</Label>
            <Input
              id={`percent-${method.id}`}
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={method.pricing.percent}
              onChange={(e) =>
                updateMethod(index, {
                  pricing: { type: "PERCENT_DISCOUNT", percent: Math.min(100, Math.max(0.01, Number(e.target.value))) },
                })
              }
            />
          </div>
        )}

        <div className="flex flex-col gap-1 rounded-md bg-neutral-50 p-2.5 text-sm">
          <div className="flex justify-between text-neutral-500">
            <span>Precio de la oferta</span>
            <span>{format(resolved.baseTotal)}</span>
          </div>
          {resolved.discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Descuento por método</span>
              <span>{format(resolved.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>{format(resolved.total)}</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="recommended-payment"
            checked={config.recommendedMethodId === method.id}
            onChange={() => onChange({ ...config, recommendedMethodId: method.id })}
          />
          Marcar como recomendado
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={codMethod?.enabled ?? false}
            disabled={onlyCodActive}
            onChange={(e) => toggleMethodType("COD", e.target.checked)}
          />
          Activar pago contra entrega
        </label>
        {onlyCodActive && <p className="text-xs text-neutral-500">Pelo menos um método de pagamento precisa continuar ativo.</p>}
        {codMethod && renderMethodFields(codMethod)}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={onlineMethod?.enabled ?? false}
            disabled={onlyOnlineActive}
            onChange={(e) => toggleMethodType("ONLINE", e.target.checked)}
          />
          Activar pago online
        </label>
        {onlyOnlineActive && <p className="text-xs text-neutral-500">Pelo menos um método de pagamento precisa continuar ativo.</p>}
        {onlineMethod && renderMethodFields(onlineMethod)}
      </div>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w) => (
            <p key={w.path} className="text-xs text-amber-700">
              {w.message}
            </p>
          ))}
        </div>
      )}

      {config.paymentMethods.length === 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...config,
              paymentMethods: [
                { id: "cod", method: "COD", provider: "INTERNAL_COD", enabled: true, label: "Pagar al recibir", pricing: { type: "NONE" } },
              ],
            })
          }
        >
          + Adicionar pago contra entrega
        </Button>
      )}
    </div>
  );
}
