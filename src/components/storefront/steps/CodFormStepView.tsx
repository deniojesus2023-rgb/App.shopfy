"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PrimaryButton } from "../buttons";
import { isSoftButtonStyle } from "../theme";
import type { CodFormStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";
import type { OrderConfirmation } from "@/modules/funnels/runtime/state";

const DEFAULT_LABELS: Record<CodFormStepConfig["fields"][number]["key"], string> = {
  NAME: "Nombre completo",
  PHONE: "Teléfono",
  WHATSAPP: "WhatsApp",
  COUNTRY: "País",
  STATE: "Departamento / Estado",
  CITY: "Ciudad",
  ADDRESS: "Dirección",
  ADDRESS_REFERENCE: "Referencia (opcional)",
};

const PHONE_KEYS = new Set(["PHONE", "WHATSAPP"]);
const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/;

const FIELD_TO_CUSTOMER_KEY: Record<CodFormStepConfig["fields"][number]["key"], string> = {
  NAME: "name",
  PHONE: "phone",
  WHATSAPP: "whatsapp",
  COUNTRY: "country",
  STATE: "state",
  CITY: "city",
  ADDRESS: "address",
  ADDRESS_REFERENCE: "addressReference",
};

interface OrderApiResponse {
  ok: boolean;
  data?: OrderConfirmation;
  error?: string;
}

function simulatedPreviewOrder(): OrderConfirmation {
  return {
    publicOrderId: "preview",
    orderNumber: 0,
    status: "PENDING",
    total: "0.00",
    currency: "",
  };
}

/**
 * A partir da Fase 3, o submit é real: chama `POST /api/storefront/orders`,
 * que é a única autoridade de preço/validação (nunca confiamos em nada
 * calculado aqui). O único caso que NÃO chama a rede de verdade é dentro do
 * builder administrativo (`isPreview`) — o preview nunca cria pedido real.
 */
export function CodFormStepView({
  config,
  theme,
  onSubmitted,
  funnelPublicId,
  funnelVersionId,
  checkoutAttemptId,
  selectedPaymentMethod,
  selectedPaymentMethodId,
  selectedOfferId,
  isPreview = false,
}: {
  config: CodFormStepConfig;
  theme: FunnelTheme;
  onSubmitted: (order: OrderConfirmation) => void;
  funnelPublicId: string;
  funnelVersionId: string;
  checkoutAttemptId: string;
  /** Método resolvido (COD/ONLINE) — só pra gate de UI, nunca enviado ao servidor. */
  selectedPaymentMethod: "COD" | "ONLINE" | null;
  /** Identidade do PaymentMethodConfig — o que de fato vai no POST (Fase 4C). */
  selectedPaymentMethodId: string | null;
  selectedOfferId: string | null;
  isPreview?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const enabledFields = config.fields.filter((f) => f.enabled);

  const schema = z.object(
    Object.fromEntries(
      enabledFields.map((field) => {
        let fieldSchema = z.string().trim().max(200);
        if (PHONE_KEYS.has(field.key)) {
          fieldSchema = fieldSchema.regex(PHONE_PATTERN, "Número inválido");
        }
        return [field.key, field.required ? fieldSchema.min(2, "Campo obrigatório") : fieldSchema.optional()];
      })
    )
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  // Pago en línea ainda não finaliza transação real nesta fase (spec item
  // 5/30) — bloqueia no client antes de sequer tentar, o servidor também
  // rejeita como defesa em profundidade.
  const onlineSelected = selectedPaymentMethod === "ONLINE";

  async function onSubmit(values: Record<string, string | undefined>) {
    setSubmitError(null);

    if (onlineSelected) {
      setSubmitError("El pago en línea aún no está disponible. Elige pago contra entrega.");
      return;
    }

    if (isPreview) {
      // Builder administrativo: nunca cria pedido real, nunca chama a rede.
      onSubmitted(simulatedPreviewOrder());
      return;
    }

    setIsSubmitting(true);
    try {
      const customer: Record<string, string> = {};
      for (const field of enabledFields) {
        const value = values[field.key];
        if (value) customer[FIELD_TO_CUSTOMER_KEY[field.key]] = value;
      }

      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelPublicId,
          funnelVersionId,
          checkoutAttemptId,
          selectedPaymentMethodId: selectedPaymentMethodId ?? undefined,
          selectedOfferId: selectedOfferId ?? undefined,
          customer,
        }),
      });

      const json = (await response.json()) as OrderApiResponse;
      if (!json.ok || !json.data) {
        setSubmitError(json.error ?? "No pudimos confirmar tu pedido. Inténtalo nuevamente.");
        return;
      }

      onSubmitted(json.data);
    } catch {
      setSubmitError("No pudimos confirmar tu pedido. Inténtalo nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-5 py-6" noValidate>
      {enabledFields.map((field) => {
        const label = field.label ?? DEFAULT_LABELS[field.key];
        const fieldError = errors[field.key];
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <label htmlFor={field.key} className="text-sm font-medium">
              {label}
              {field.required && <span aria-hidden="true"> *</span>}
            </label>
            <input
              id={field.key}
              type={PHONE_KEYS.has(field.key) ? "tel" : "text"}
              autoComplete="off"
              aria-required={field.required}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? `${field.key}-error` : undefined}
              className="h-11 rounded-[var(--storefront-radius)] border px-3 text-base focus-visible:outline focus-visible:outline-2"
              style={{ borderColor: "rgba(0,0,0,0.15)", outlineColor: "var(--storefront-primary)" }}
              {...register(field.key)}
            />
            {fieldError && (
              <p id={`${field.key}-error`} className="text-xs text-red-600">
                {String(fieldError.message)}
              </p>
            )}
          </div>
        );
      })}

      {config.paymentNotice && <p className="text-xs opacity-60">{config.paymentNotice}</p>}

      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}

      <PrimaryButton soft={isSoftButtonStyle(theme)} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : config.submitButtonText}
      </PrimaryButton>
    </form>
  );
}
