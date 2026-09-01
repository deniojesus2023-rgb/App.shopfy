/**
 * Identidade externa de uma tentativa de checkout ONLINE dentro da Shopify
 * (Fase 4D). Duas âncoras, com papéis diferentes e deliberadamente
 * separados — a assimetria com o fluxo COD é real e documentada:
 *
 * 1. TAG no Draft Order (`appshopfy_checkout_<attemptId>`): é o único
 *    campo que a Admin API permite PESQUISAR em draft orders
 *    (`draftOrders(query: "tag:...")`). O `orderCreate` do COD tem
 *    `sourceIdentifier` (filtrável e não editável pela UI), mas draft
 *    order não expõe equivalente — então aqui a tag É a identidade de
 *    reconciliação, não só apoio visual.
 *
 *    Isso seria inaceitável para um pedido (a Fase 3 rejeitou tag como
 *    identidade justamente por ser editável na UI da Shopify e por
 *    qualquer app instalado). Aqui é aceitável porque o pior caso é
 *    diferente: um draft order duplicado NÃO é uma cobrança duplicada —
 *    draft não é venda. O prejuízo de uma reconciliação falha é um
 *    rascunho abandonado, nunca dinheiro cobrado duas vezes.
 *
 * 2. CUSTOM ATTRIBUTE no Draft Order (mesmo valor): é o que sobrevive
 *    quando o draft order vira Order pago — a doc oficial diz que "notes
 *    and note attributes are included" no pedido criado ao aceitar o
 *    pagamento. É por ele que o webhook `orders/create` reconhece que
 *    aquele pedido nasceu de um funil nosso.
 *    A VERIFICAR em development store (checklist no README): que o
 *    atributo realmente aparece em `note_attributes` do payload do
 *    webhook. Enquanto não confirmado, o fluxo ONLINE fica atrás da flag
 *    `SHOPIFY_ONLINE_CHECKOUT_ENABLED`.
 *
 * O valor é namespaced (nunca colide com outra integração instalada na
 * mesma loja) e carrega só o id opaco da tentativa — nenhum dado pessoal,
 * nada derivado do cliente.
 */
const PREFIX = "appshopfy_checkout_";

/** Chave do custom attribute / note attribute que carrega a identidade. */
export const ONLINE_CHECKOUT_ATTRIBUTE_KEY = "_appshopfy_checkout";

export function onlineCheckoutIdentity(attemptId: string): string {
  return `${PREFIX}${attemptId}`;
}

export function parseOnlineCheckoutIdentity(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const attemptId = value.slice(PREFIX.length);
  return attemptId.length > 0 ? attemptId : null;
}

/**
 * Extrai a identidade de uma lista de note attributes vinda do webhook
 * (`orders/create`). Tolerante ao formato: aceita tanto a chave dedicada
 * quanto qualquer atributo cujo VALOR seja um identificador nosso — a
 * segunda forma cobre o caso de a Shopify renomear/normalizar a chave
 * (que só vamos confirmar em dev store), sem nunca aceitar um valor que
 * não tenha o nosso prefixo.
 */
export function findOnlineCheckoutIdentity(
  noteAttributes: Array<{ name?: string | null; value?: string | null }> | null | undefined
): string | null {
  for (const attribute of noteAttributes ?? []) {
    const parsed = parseOnlineCheckoutIdentity(attribute?.value);
    if (parsed) return parsed;
  }
  return null;
}
