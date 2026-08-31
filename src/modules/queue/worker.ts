import "server-only";

import type { BackgroundJob } from "@prisma/client";

import { processFullCatalogSyncJob } from "@/modules/catalog/handlers/full-sync";
import { processProductDeleteJob } from "@/modules/catalog/handlers/product-delete";
import { processProductSyncJob } from "@/modules/catalog/handlers/product-sync";
import { processShopifyOrderCreateJob } from "@/modules/orders/handlers/shopify-order-create";
import { JOB_PAYLOAD_SCHEMAS, type BackgroundJobTypeName } from "./types";

/**
 * Único ponto que sabe rotear um job reivindicado para o handler certo.
 * Revalida o payload com Zod ao ler do banco (defesa extra — o schema pode
 * ter mudado entre o enqueue e o processamento, ou a linha pode ter sido
 * inserida manualmente).
 */
export async function dispatchJob(job: BackgroundJob): Promise<void> {
  const type = job.type as BackgroundJobTypeName;
  const schema = JOB_PAYLOAD_SCHEMAS[type];
  const payload = schema.parse(job.payload);

  switch (type) {
    case "SHOPIFY_FULL_CATALOG_SYNC":
      return processFullCatalogSyncJob(payload as never);
    case "SHOPIFY_PRODUCT_SYNC":
      return processProductSyncJob(payload as never);
    case "SHOPIFY_PRODUCT_DELETE":
      return processProductDeleteJob(payload as never);
    case "SHOPIFY_ORDER_CREATE":
      return processShopifyOrderCreateJob(payload as never);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Tipo de job desconhecido: ${_exhaustive}`);
    }
  }
}
