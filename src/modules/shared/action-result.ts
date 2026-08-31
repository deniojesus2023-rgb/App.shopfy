// Formato padrão de retorno de Server Actions, para não vazar stack traces
// ou mensagens internas de erro para o client, e para o form no client
// conseguir renderizar erro de validação por campo.

import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "./errors";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      // Só setado para erros que o client precisa distinguir por tipo (não
      // por texto) — hoje só conflito de optimistic concurrency, para o
      // builder saber quando mostrar o modal de conflito em vez de um erro genérico.
      code?: "CONFLICT";
    };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError<T>(
  error: unknown,
  fallbackMessage = "Não foi possível concluir a ação."
): ActionResult<T> {
  if (error instanceof ConflictError) {
    return { ok: false, error: error.message, code: "CONFLICT" };
  }
  if (
    error instanceof UnauthorizedError ||
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError
  ) {
    return { ok: false, error: error.message };
  }

  // Erro inesperado: logar no servidor, não expor detalhes ao client.
  console.error(error);
  return { ok: false, error: fallbackMessage };
}
