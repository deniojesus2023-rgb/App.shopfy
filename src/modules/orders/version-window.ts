/**
 * Política de "version race" (spec Fase 3, item 9): um visitante que abriu
 * o storefront numa versão PUBLISHED pode concluir a compra nessa mesma
 * versão por uma janela curta mesmo que o lojista publique uma versão nova
 * enquanto ele preenchia o formulário — mas não indefinidamente (uma versão
 * SUPERSEDED há dias não deve continuar "comprável").
 *
 * 20 minutos é generoso o bastante para cobrir "cliente demorou para
 * preencher o formulário COD" sem manter versões antigas vendáveis por
 * muito tempo. Ajustar aqui é seguro — nenhum outro lugar deveria
 * hardcodar esse número.
 */
export const VERSION_RACE_GRACE_MS = 20 * 60 * 1000;

export interface VersionEligibilityInput {
  funnelId: string;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  supersededAt: Date | null;
}

/**
 * Nunca aceita DRAFT/ARCHIVED (uma versão nunca publicada não é elegível,
 * mesmo que o config seja válido). PUBLISHED (a atual) é sempre elegível.
 * SUPERSEDED só é elegível dentro da janela de graça.
 */
export function isVersionEligibleForCheckout(
  version: VersionEligibilityInput,
  expectedFunnelId: string,
  now: Date = new Date()
): boolean {
  if (version.funnelId !== expectedFunnelId) return false;
  if (version.status === "PUBLISHED") return true;
  if (version.status === "SUPERSEDED" && version.supersededAt) {
    return now.getTime() - version.supersededAt.getTime() < VERSION_RACE_GRACE_MS;
  }
  return false;
}
