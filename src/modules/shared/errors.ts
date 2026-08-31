// Erros de domínio, usados pelas Server Actions e Route Handlers para
// diferenciar "não autenticado" de "autenticado mas sem permissão" e de
// "recurso não existe (ou não pertence ao seu tenant)".
//
// Uma entidade de outro workspace deve responder como NotFoundError, nunca
// ForbiddenError — não queremos confirmar para um invasor que o recurso
// existe em outro tenant.

export class UnauthorizedError extends Error {
  constructor(message = "Não autenticado.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sem permissão para executar esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Recurso não encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message = "Dados inválidos.") {
    super(message);
    this.name = "ValidationError";
  }
}

/** Optimistic concurrency: o recurso mudou entre a leitura e a escrita (ex.: revision divergente). */
export class ConflictError extends Error {
  constructor(message = "O recurso foi alterado por outra ação. Recarregue e tente novamente.") {
    super(message);
    this.name = "ConflictError";
  }
}
