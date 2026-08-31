/** Lançado por um handler de job para indicar que retry nunca vai ajudar (token inválido, loja não existe mais, etc.). */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}
