import "server-only";

import { prisma } from "@/lib/db";
import { NotFoundError } from "@/modules/shared/errors";
import type { OrderStatus } from "@prisma/client";

export interface ListOrdersFilter {
  status?: OrderStatus;
  search?: string;
}

/**
 * Tenant-scoped por construção — todo `where` aqui inclui `workspaceId`, a
 * própria assinatura obriga o caller a já ter resolvido o tenant (spec item
 * 27: nenhuma tela admin confia só na UI). Busca por `orderNumber` apenas
 * (nunca por nome/telefone — evita virar uma busca de PII disfarçada).
 */
export async function listOrdersForWorkspace(workspaceId: string, filter: ListOrdersFilter = {}) {
  const searchNumber = filter.search ? Number(filter.search.replace(/\D/g, "")) : undefined;

  return prisma.order.findMany({
    where: {
      workspaceId,
      status: filter.status,
      orderNumber: searchNumber && !Number.isNaN(searchNumber) ? searchNumber : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      codLead: { select: { name: true, phone: true, city: true, state: true } },
      funnel: { select: { name: true } },
    },
  });
}

export async function getOrderForWorkspace(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    include: {
      codLead: true,
      funnel: { select: { name: true, slug: true } },
      items: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) {
    throw new NotFoundError("Pedido não encontrado.");
  }
  return order;
}
