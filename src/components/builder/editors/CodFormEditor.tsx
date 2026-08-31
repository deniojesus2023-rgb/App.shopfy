"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COD_FIELD_KEYS, type CodFormStepConfig } from "@/modules/funnels/config/steps";

const FIELD_LABELS: Record<(typeof COD_FIELD_KEYS)[number], string> = {
  NAME: "Nome completo",
  PHONE: "Telefone",
  WHATSAPP: "WhatsApp",
  COUNTRY: "País",
  STATE: "Departamento/Estado",
  CITY: "Cidade",
  ADDRESS: "Endereço",
  ADDRESS_REFERENCE: "Referência",
};

export function CodFormEditor({
  config,
  onChange,
}: {
  config: CodFormStepConfig;
  onChange: (config: CodFormStepConfig) => void;
}) {
  const byKey = new Map(config.fields.map((f) => [f.key, f]));

  function toggleField(key: (typeof COD_FIELD_KEYS)[number], enabled: boolean) {
    const existing = byKey.get(key);
    if (existing) {
      onChange({
        ...config,
        fields: config.fields.map((f) => (f.key === key ? { ...f, enabled, required: enabled ? f.required : false } : f)),
      });
    } else if (enabled) {
      onChange({ ...config, fields: [...config.fields, { key, enabled: true, required: false }] });
    }
  }

  function setRequired(key: (typeof COD_FIELD_KEYS)[number], required: boolean) {
    onChange({ ...config, fields: config.fields.map((f) => (f.key === key ? { ...f, required } : f)) });
  }

  function setLabel(key: (typeof COD_FIELD_KEYS)[number], label: string) {
    onChange({ ...config, fields: config.fields.map((f) => (f.key === key ? { ...f, label: label || undefined } : f)) });
  }

  function move(key: (typeof COD_FIELD_KEYS)[number], direction: -1 | 1) {
    const index = config.fields.findIndex((f) => f.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= config.fields.length) return;
    const fields = [...config.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    onChange({ ...config, fields });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {/* A ordem dos campos no formulário segue a ordem deste array — o
            schema já suporta reordenar sem nenhuma mudança de estrutura. */}
        {config.fields.map((field, index) => (
          <div key={field.key} className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={field.enabled}
                  onChange={(e) => toggleField(field.key, e.target.checked)}
                />
                {FIELD_LABELS[field.key]}
              </label>
              <div className="flex gap-1 text-xs">
                <button type="button" disabled={index === 0} onClick={() => move(field.key, -1)} aria-label={`Mover ${FIELD_LABELS[field.key]} para cima`}>
                  ▲
                </button>
                <button
                  type="button"
                  disabled={index === config.fields.length - 1}
                  onClick={() => move(field.key, 1)}
                  aria-label={`Mover ${FIELD_LABELS[field.key]} para baixo`}
                >
                  ▼
                </button>
              </div>
            </div>

            {field.enabled && (
              <div className="flex flex-col gap-2 pl-6">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={field.required} onChange={(e) => setRequired(field.key, e.target.checked)} />
                  Obrigatório
                </label>
                <Input
                  placeholder={`Rótulo (padrão: ${FIELD_LABELS[field.key]})`}
                  value={field.label ?? ""}
                  maxLength={60}
                  onChange={(e) => setLabel(field.key, e.target.value)}
                  aria-label={`Rótulo customizado para ${FIELD_LABELS[field.key]}`}
                />
              </div>
            )}
          </div>
        ))}

        {COD_FIELD_KEYS.filter((k) => !byKey.has(k)).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {COD_FIELD_KEYS.filter((k) => !byKey.has(k)).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleField(key, true)}
                className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
              >
                + {FIELD_LABELS[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="submitButtonText">Texto do botão de envio</Label>
        <Input
          id="submitButtonText"
          value={config.submitButtonText}
          maxLength={60}
          onChange={(e) => onChange({ ...config, submitButtonText: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paymentNotice">Aviso sobre o pagamento</Label>
        <Input
          id="paymentNotice"
          value={config.paymentNotice ?? ""}
          maxLength={300}
          onChange={(e) => onChange({ ...config, paymentNotice: e.target.value })}
        />
      </div>
    </div>
  );
}
