import { z } from "zod";

// Bloqueia o que daria a um lojista malicioso (ou a uma conta comprometida)
// um jeito de injetar comportamento executável dentro do config JSON de um
// funil: nenhuma tag HTML, nenhum esquema `javascript:`, nenhum handler de
// evento inline (`onclick=`, etc). O config é dado, nunca marcação/código.
const HTML_TAG_PATTERN = /<[^>]*>/;
const JS_SCHEME_PATTERN = /javascript:/i;
const EVENT_HANDLER_PATTERN = /on\w+\s*=/i;

function baseSafeText(maxLength: number) {
  return z
    .string()
    .max(maxLength, `Texto excede o limite de ${maxLength} caracteres.`)
    .refine((value) => !HTML_TAG_PATTERN.test(value), "Não é permitido HTML.")
    .refine((value) => !JS_SCHEME_PATTERN.test(value), "Não é permitido esquema javascript:.")
    .refine((value) => !EVENT_HANDLER_PATTERN.test(value), "Não é permitido handler de evento inline.");
}

// Overloads: sem o TS conseguir ver, por chamada, se `optional` é `true`
// literal, o retorno seria inferido como uma união `ZodString |
// ZodOptional<ZodString>` — o que faz o Zod tratar o campo como uma CHAVE
// OBRIGATÓRIA de tipo `string | undefined` dentro de `z.object(...)`, não
// como uma chave opcional de verdade. Os overloads garantem que cada call
// site com `{ optional: true }` literal infira `ZodOptional<...>`.
export function safeText(maxLength: number): ReturnType<typeof baseSafeText>;
export function safeText(
  maxLength: number,
  options: { optional: true }
): z.ZodOptional<ReturnType<typeof baseSafeText>>;
export function safeText(maxLength: number, options: { optional?: boolean } = {}) {
  const base = baseSafeText(maxLength);
  return options.optional ? base.optional() : base;
}

export const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const hexColor = z
  .string()
  .regex(HEX_COLOR_PATTERN, "Cor deve ser um código hexadecimal (#RRGGBB ou #RGB).");
