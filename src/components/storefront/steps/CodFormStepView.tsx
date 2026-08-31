"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PrimaryButton } from "../buttons";
import { isSoftButtonStyle } from "../theme";
import type { CodFormStepConfig } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

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

/**
 * IMPORTANTE: nenhum dado deste formulário é enviado a um servidor, criado
 * como pedido, ou persistido em sessionStorage/banco nesta fase — vive
 * só no estado local do react-hook-form, descartado quando o componente
 * desmonta ao avançar para SUCCESS. Ver README (Fase 2B) para o porquê.
 */
export function CodFormStepView({
  config,
  theme,
  onSubmitted,
}: {
  config: CodFormStepConfig;
  theme: FunnelTheme;
  onSubmitted: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  async function onSubmit() {
    setIsSubmitting(true);
    // Simulação deliberada — sem COD Engine real nesta fase (ver Fase 3).
    await new Promise((resolve) => setTimeout(resolve, 700));
    onSubmitted();
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

      <PrimaryButton soft={isSoftButtonStyle(theme)} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : config.submitButtonText}
      </PrimaryButton>
    </form>
  );
}
