import "server-only";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/modules/audit/service";
import { NonRetryableJobError } from "@/modules/queue/errors";
import type { ShopifyOrderCreatePayload } from "@/modules/queue/types";
import { ShopifyApiError, ShopifyAuthError, ShopifyThrottledError, ShopifyTimeoutError } from "@/modules/shopify/client";
import { createShopifyOrder, findShopifyOrdersBySourceIdentifier, type ShopifyOrderRef } from "@/modules/shopify/orders";
import { getDecryptedAccessToken } from "@/modules/shopify/stores/service";
import { roundMoney } from "@/modules/shared/money";
import { redactOrderFields } from "@/modules/shared/redact";
import { orderSourceIdentifier } from "../shopify-identity";
import { buildShopifyLineItems, projectedTotalCents } from "../shopify-line-items";
import { internalOrderTag } from "../shopify-tag";

/**
 * Classificação da falha de uma tentativa de `orderCreate`, do ponto de
 * vista da ÚNICA pergunta que importa para idempotência externa: "esta
 * falha pode ter deixado um pedido criado na Shopify?".
 *
 * - `safe`: a Shopify rejeitou a request ANTES de executar a mutação
 *   (throttle, 4xx). Nenhum pedido foi criado — a próxima tentativa pode
 *   ir direto ao `orderCreate` sem gastar uma consulta de reconciliação.
 * - `ambiguous`: timeout, falha de rede, 5xx, ou qualquer erro
 *   desconhecido. A mutação PODE ter sido executada — a próxima tentativa
 *   é obrigada a reconciliar antes de criar. Default conservador de
 *   propósito: um erro que não sabemos classificar é sempre ambíguo.
 */
type FailureClass = "safe" | "ambiguous";

export function classifyShopifyFailure(error: unknown): FailureClass {
  // Throttle: a Shopify recusa a request pelo custo antes de processá-la.
  if (error instanceof ShopifyThrottledError) return "safe";
  // Timeout do nosso lado: a request pode ter chegado e sido processada.
  if (error instanceof ShopifyTimeoutError) return "ambiguous";
  if (error instanceof ShopifyApiError) {
    const status = error.httpStatus;
    // 5xx pode ser falha DEPOIS da mutação ter sido aplicada.
    if (status !== null && status >= 500) return "ambiguous";
    // 4xx (fora 401, tratado antes) = request rejeitada, nada criado.
    if (status !== null && status >= 400) return "safe";
    return "ambiguous";
  }
  // Erro de transporte (reset de conexão, DNS, etc.) ou desconhecido.
  return "ambiguous";
}

/**
 * Worker do job SHOPIFY_ORDER_CREATE. O Order local já existe e já é a
 * fonte de verdade da venda — esta função só reflete isso na Shopify.
 *
 * Idempotência externa (a Shopify não oferece idempotency key para
 * `orderCreate`): a identidade é o `sourceIdentifier`
 * `appshopfy_order_<Order.id>`, gravado no pedido na criação e filtrável
 * por `source_identifier:` na query `orders`. A regra de reconciliação é
 * baseada num marcador durável: `shopifySyncStatus = SYNCING` é gravado
 * ANTES de qualquer chamada de rede, então
 *   - status PENDING  ⇒ nenhum `orderCreate` foi tentado ⇒ pode criar direto;
 *   - status SYNCING  ⇒ uma tentativa anterior chegou até a rede e o
 *                       resultado é desconhecido ⇒ TEM que reconciliar antes.
 * É isso que fecha a janela "worker criou na Shopify → resposta se perdeu →
 * worker morreu → job foi recuperado por outro worker".
 */
export async function processShopifyOrderCreateJob(payload: ShopifyOrderCreatePayload): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: payload.orderId },
    include: { codLead: true, items: true, shopifyStore: true },
  });
  if (!order) {
    throw new NonRetryableJobError("Order não encontrado.");
  }
  // Este worker é EXCLUSIVO do fluxo COD (Fase 4D item 12): um pedido
  // ONLINE nasce já sincronizado, pela reconciliação do webhook, e nunca
  // deve ser enfileirado aqui. Sem CodLead não há endereço de entrega para
  // mandar à Shopify — falha fechada em vez de criar um pedido incompleto.
  if (!order.codLead) {
    throw new NonRetryableJobError("Order sem CodLead — fluxo ONLINE não usa este worker.");
  }
  const codLead = order.codLead;

  if (order.shopifyOrderId) {
    // Já sincronizado (ex.: webhook orders/create reconciliou antes do
    // worker, ou job reprocessado) — idempotente, não repete a chamada.
    if (order.shopifySyncStatus !== "SYNCED") {
      await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "SYNCED" } });
    }
    return;
  }

  if (order.shopifySyncStatus === "MANUAL_REVIEW") {
    // Duplicata externa já detectada numa tentativa anterior — nunca
    // tentar de novo por conta própria.
    throw new NonRetryableJobError("Pedido aguardando reconciliação manual na Shopify.");
  }

  if (!env.SHOPIFY_ORDER_SYNC_ENABLED) {
    // Dev/test sem o interruptor ligado: nunca chama a Shopify. O Order
    // continua PENDING de sync — comportamento esperado e documentado.
    return;
  }

  const store = order.shopifyStore;
  if (store.status !== "CONNECTED") {
    await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
    throw new NonRetryableJobError("Loja Shopify não está conectada.");
  }

  // Fidelidade do quote: cada OrderItem já carrega `lineTotal` EXATO (sem
  // nenhuma divisão) — é isto, e não `unitPrice × quantity`, que precisa
  // bater com `Order.total` (uma oferta FIXED_TOTAL com quantity que não
  // divide o total em centavos exatos torna `unitPrice` só informativo,
  // nunca reconstituível por multiplicação; ver modules/orders/pricing.ts).
  // Se um dia houver frete/múltiplos itens e a soma não bater, falha
  // fechada antes de criar qualquer coisa na Shopify, em vez de cobrar um
  // valor divergente do que o cliente aceitou.
  const lineItemsTotal = roundMoney(order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0));
  if (lineItemsTotal !== roundMoney(Number(order.total))) {
    await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
    throw new NonRetryableJobError(
      "Quote local não é representável como line items simples (desconto/frete ainda não suportados na criação Shopify)."
    );
  }

  // Projeção para a Shopify preservando as DUAS semânticas: quantidade
  // física real e total exato. Um pacote FIXED_TOTAL cujo total não divide
  // em centavos pela quantidade vira mais de um line item da mesma
  // variante, nunca uma linha de quantidade 1 (ver shopify-line-items.ts).
  const lineItems = buildShopifyLineItems(
    order.items.map((item) => ({
      titleSnapshot: item.titleSnapshot,
      shopifyVariantId: item.shopifyVariantId,
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
    }))
  );

  // Invariante final antes de tocar a rede: o que a Shopify vai cobrar
  // (Σ preço unitário × quantidade) tem que ser exatamente `Order.total`.
  // A distribuição garante isso por construção — esta checagem existe para
  // que qualquer regressão futura falhe fechada em vez de cobrar errado.
  if (projectedTotalCents(lineItems) !== Math.round(Number(order.total) * 100)) {
    await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
    throw new NonRetryableJobError("Projeção de line items não reproduz o total do pedido.");
  }

  // PENDING é o ÚNICO estado que prova que nenhuma tentativa chegou à
  // rede (o marcador SYNCING é gravado antes do primeiro byte sair).
  // Qualquer outro estado — SYNCING (tentativa ambígua), FAILED (tentativa
  // que esgotou retries e pode ter criado) — obriga a reconciliar antes.
  const needsReconciliationFirst = order.shopifySyncStatus !== "PENDING";
  const sourceIdentifier = orderSourceIdentifier(order.id);

  let accessToken: string;
  try {
    accessToken = await getDecryptedAccessToken(order.workspaceId, order.shopifyStoreId);
  } catch {
    await markReauthRequired(order.id, order.shopifyStoreId);
    throw new NonRetryableJobError("Token indisponível.");
  }

  if (needsReconciliationFirst) {
    const reconciled = await reconcileBeforeCreate(order, accessToken, sourceIdentifier);
    if (reconciled) return;
  }

  // Marcador durável de "a partir daqui, o resultado pode ser ambíguo".
  await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "SYNCING" } });

  try {
    const outcome = await createShopifyOrder(store.shopDomain, accessToken, {
      currency: order.currency,
      sourceIdentifier,
      internalOrderTag: internalOrderTag(order.id),
      note: `Pedido COD #${order.orderNumber}`,
      phone: codLead.phone,
      lineItems,
      shippingAddress: {
        firstName: codLead.name,
        address1: codLead.address,
        city: codLead.city,
        province: codLead.state,
        country: codLead.country,
        phone: codLead.phone,
      },
    });

    if (outcome.outcome === "userErrors") {
      // A Shopify rejeitou o CONTEÚDO da mutation: nada foi criado e
      // retentar o mesmo payload nunca vai funcionar.
      await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "FAILED" } });
      await logAudit({
        workspaceId: order.workspaceId,
        userId: null,
        action: "order.shopify_sync_failed",
        entityType: "Order",
        entityId: order.id,
        metadata: { errors: outcome.errors },
      });
      throw new NonRetryableJobError(`Shopify rejeitou o pedido: ${outcome.errors.join("; ")}`);
    }

    await persistSyncedOrder(order.id, outcome.result);
  } catch (error) {
    if (error instanceof NonRetryableJobError) throw error;

    if (error instanceof ShopifyAuthError) {
      // 401 é rejeitado antes de qualquer mutação — nada foi criado.
      await markReauthRequired(order.id, order.shopifyStoreId);
      throw new NonRetryableJobError("Reautorização necessária.");
    }

    const failureClass = classifyShopifyFailure(error);
    if (failureClass === "safe") {
      // Volta o marcador: a próxima tentativa sabe que não precisa gastar
      // uma consulta de reconciliação.
      await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "PENDING" } });
    }
    // Em `ambiguous`, o status fica em SYNCING de propósito — é o que
    // obriga a próxima tentativa a reconciliar antes de criar.

    console.error(
      "[orders] shopify order create failed",
      redactOrderFields({
        orderId: order.id,
        workspaceId: order.workspaceId,
        shopifyStoreId: order.shopifyStoreId,
        shopifySyncStatus: failureClass === "safe" ? "PENDING" : "SYNCING",
        errorCode: failureClass,
      })
    );

    // Sobe para a fila retentar com backoff (ambos os casos são
    // retentáveis — a diferença está em precisar reconciliar antes).
    throw error;
  }
}

/**
 * Consulta a Shopify por `source_identifier` antes de repetir uma criação
 * cujo resultado é desconhecido. Retorna `true` quando o pedido já existe
 * lá (reconciliado, nada mais a fazer).
 */
async function reconcileBeforeCreate(
  order: { id: string; workspaceId: string; shopifyStoreId: string; shopifyStore: { shopDomain: string } },
  accessToken: string,
  sourceIdentifier: string
): Promise<boolean> {
  const matches = await findShopifyOrdersBySourceIdentifier(
    order.shopifyStore.shopDomain,
    accessToken,
    sourceIdentifier
  );

  if (matches.length === 1) {
    await persistSyncedOrder(order.id, matches[0]);
    return true;
  }

  if (matches.length > 1) {
    // Duplicata externa real: alguma tentativa anterior criou mais de um
    // pedido. Nunca criar outro, nunca escolher um sozinho — isso é
    // decisão humana (qual manter, qual cancelar na Shopify).
    await prisma.order.update({ where: { id: order.id }, data: { shopifySyncStatus: "MANUAL_REVIEW" } });
    await logAudit({
      workspaceId: order.workspaceId,
      userId: null,
      action: "order.shopify_sync_failed",
      entityType: "Order",
      entityId: order.id,
      metadata: { reason: "duplicate_source_identifier", matches: matches.length },
    });
    console.error(
      "[orders] duplicate shopify orders for source identifier",
      redactOrderFields({
        orderId: order.id,
        workspaceId: order.workspaceId,
        shopifyStoreId: order.shopifyStoreId,
        shopifySyncStatus: "MANUAL_REVIEW",
        errorCode: "duplicate_source_identifier",
      })
    );
    throw new NonRetryableJobError(
      "Mais de um pedido na Shopify com o mesmo identificador de origem — reconciliação manual necessária."
    );
  }

  // Nenhum resultado: a tentativa anterior realmente não criou nada
  // (ou o índice de busca ainda não refletiu). Segue para a criação
  // normal, conforme a política de retry existente.
  return false;
}

async function persistSyncedOrder(orderId: string, result: ShopifyOrderRef): Promise<void> {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      shopifyOrderId: result.shopifyOrderId,
      shopifyOrderName: result.shopifyOrderName,
      shopifySyncStatus: "SYNCED",
      shopifyCreatedAt: new Date(result.shopifyCreatedAt),
    },
  });

  await logAudit({
    workspaceId: order.workspaceId,
    userId: null,
    action: "order.shopify_synced",
    entityType: "Order",
    entityId: order.id,
    metadata: { shopifyOrderId: result.shopifyOrderId, shopifyOrderName: result.shopifyOrderName },
  });
}

async function markReauthRequired(orderId: string, shopifyStoreId: string): Promise<void> {
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { shopifySyncStatus: "REAUTH_REQUIRED" } }),
    prisma.shopifyStore.update({ where: { id: shopifyStoreId }, data: { status: "REAUTH_REQUIRED" } }),
  ]);
}
