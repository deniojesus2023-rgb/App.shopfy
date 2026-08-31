/**
 * Normalização básica só (spec item 12): trim + colapsar espaços +
 * telefone. Nada de geocoding, nada de "corrigir" endereço/cidade — não
 * inventamos dado válido que o cliente não digitou.
 */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Mantém dígitos e um "+" inicial opcional — suficiente para reconciliação futura, nunca para validar formato de verdade. */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}
