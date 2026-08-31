import "server-only";

import type { ShopifyProductDeletePayload } from "@/modules/queue/types";
import { softDeleteProductByShopifyId } from "../service";

export async function processProductDeleteJob(payload: ShopifyProductDeletePayload): Promise<void> {
  await softDeleteProductByShopifyId(payload.shopifyStoreId, payload.shopifyProductId);
}
