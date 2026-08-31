/**
 * Tag única por funil público. `resolvePublicFunnel` cacheia (via
 * `unstable_cache`) sob esta tag; publicar/arquivar chama `revalidateTag`
 * com o mesmo valor — é assim que uma nova versão publicada passa a ser
 * servida sem esperar um TTL expirar.
 */
export function funnelPublicCacheTag(publicId: string): string {
  return `funnel-public:${publicId}`;
}
