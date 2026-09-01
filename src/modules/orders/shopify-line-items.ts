/**
 * Projeção de `OrderItem` (autoridade local) para line items da Shopify.
 *
 * O problema que este módulo resolve: uma oferta FIXED_TOTAL fixa o TOTAL
 * do pacote, não o preço unitário. Quando o total não divide em centavos
 * exatos pela quantidade (ex.: 149.900 / 3 = 49.966,666...), não existe um
 * único preço unitário capaz de reproduzir o total.
 *
 * A correção da Fase 4A original resolvia isso mandando `quantity: 1` com
 * `unitPrice = lineTotal` e a quantidade comercial só no título. Isso
 * preservava o dinheiro mas destruía a semântica de quantidade: inventory,
 * fulfillment, picking, refunds e relatórios na Shopify passavam a "ver"
 * 1 unidade vendida quando foram 3. Título é apresentação, nunca campo de
 * integração — nada downstream pode depender dele para saber quantidade.
 *
 * Estratégia atual: distribuição determinística de centavos entre as
 * unidades físicas, agrupada em no máximo DOIS line items da mesma
 * variante. Distribuindo `totalCents` por `quantity` unidades sobram no
 * máximo `quantity - 1` centavos, e cada unidade recebe `base` ou
 * `base + 1` centavos — ou seja, só existem dois preços unitários
 * possíveis, o que colapsa em dois grupos:
 *
 *   149.900 em 3 unidades → 2 × 49.966,67 + 1 × 49.966,66 = 149.900,00
 *   quantidade física total = 3
 *
 * Invariantes garantidas por construção (e verificadas em teste):
 *   - Σ quantity  === OrderItem.quantity  (quantidade comercial real)
 *   - Σ (quantity × unitPrice) === OrderItem.lineTotal  (dinheiro exato)
 *
 * Quando o total divide exato (o caso comum, incluindo todo
 * UNIT_MULTIPLIER), o resto é zero e sai UM único line item com a
 * quantidade real — nenhum split desnecessário.
 *
 * A aritmética acontece em centavos inteiros porque essa é a precisão do
 * armazenamento (`Decimal(12,2)`) e a do payload da Shopify (Fase 3: o
 * campo de dinheiro é sempre string com 2 casas, inclusive para moedas
 * zero-decimal). `Order.total` é definido nessa mesma precisão, então é
 * nela que a invariante de soma exata tem significado.
 */

/** Um line item já projetado, pronto para virar payload da Shopify. */
export interface ShopifyLineItemProjection {
  /** GID da variante na Shopify, quando a identidade foi congelada. */
  variantId: string | null;
  /**
   * Apresentação apenas. NUNCA carrega quantidade nem qualquer informação
   * de que algum consumidor downstream dependa.
   */
  title: string;
  /** Quantidade FÍSICA real de unidades desta linha. */
  quantity: number;
  /** Preço unitário formatado com 2 casas — a Shopify multiplica por `quantity`. */
  unitPrice: string;
}

/** A fatia de `OrderItem` de que a projeção depende. */
export interface OrderItemForProjection {
  titleSnapshot: string;
  shopifyVariantId: string | null;
  quantity: number;
  /** Total EXATO da linha — nunca recomposto por `unitPrice × quantity`. */
  lineTotal: number;
}

interface DistributedGroup {
  quantity: number;
  unitPriceCents: number;
}

/**
 * Distribui `lineTotal` entre `quantity` unidades físicas sem perder nem
 * criar um centavo. Retorna no máximo dois grupos, do preço unitário maior
 * para o menor (ordem determinística — a mesma entrada sempre produz o
 * mesmo payload, o que importa para reconciliação e para os testes).
 */
export function distributeLineTotal(lineTotal: number, quantity: number): DistributedGroup[] {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Quantidade inválida para distribuição: ${quantity}`);
  }
  if (!Number.isFinite(lineTotal) || lineTotal < 0) {
    throw new Error(`Total de linha inválido para distribuição: ${lineTotal}`);
  }

  const totalCents = Math.round(lineTotal * 100);
  const base = Math.floor(totalCents / quantity);
  // Sobra sempre em [0, quantity - 1]: são as unidades que levam 1 centavo
  // a mais para a soma fechar exatamente no total.
  const remainder = totalCents - base * quantity;

  const groups: DistributedGroup[] = [];
  if (remainder > 0) {
    groups.push({ quantity: remainder, unitPriceCents: base + 1 });
  }
  if (quantity - remainder > 0) {
    groups.push({ quantity: quantity - remainder, unitPriceCents: base });
  }
  return groups;
}

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Projeta os `OrderItem` de um pedido nos line items da Shopify,
 * preservando quantidade física e total exato.
 *
 * `variantId` só vai quando a identidade da variante foi congelada no
 * snapshot da versão publicada. Pedidos criados antes disso (e produtos
 * sem variante congelada) caem em "custom line item" — sem `variantId`,
 * mas ainda com a quantidade real, nunca mais achatada em 1.
 */
export function buildShopifyLineItems(items: OrderItemForProjection[]): ShopifyLineItemProjection[] {
  return items.flatMap((item) =>
    distributeLineTotal(item.lineTotal, item.quantity).map((group) => ({
      variantId: item.shopifyVariantId,
      title: item.titleSnapshot,
      quantity: group.quantity,
      unitPrice: centsToAmount(group.unitPriceCents),
    }))
  );
}

/**
 * Soma, em centavos, o que a Shopify vai cobrar pelos line items
 * projetados. Usado como verificação final antes de tocar a rede: se por
 * qualquer motivo a projeção não reproduzir `Order.total` exatamente, o
 * worker falha fechado em vez de criar um pedido com valor divergente do
 * que o cliente aceitou.
 */
export function projectedTotalCents(lineItems: ShopifyLineItemProjection[]): number {
  return lineItems.reduce((sum, item) => sum + Math.round(Number(item.unitPrice) * 100) * item.quantity, 0);
}
