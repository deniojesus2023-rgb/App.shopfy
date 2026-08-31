// Formato padrão de retorno de Server Actions, para não vazar stack traces
// ou mensagens internas de erro para o client, e para o form no client
// conseguir renderizar erro de validação por campo.

import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "./errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError<T>(
  error: unknown,
  fallbackMessage = "Não foi possível concluir a ação."
): ActionResult<T> {
  if (
    error instanceof UnauthorizedError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof ConflictError
  ) {
    return { ok: false, error: error.message };
  }

  // Erro inesperado: logar no servidor, não expor detalhes ao client.
  console.error(error);
  return { ok: false, error: fallbackMessage };
}
