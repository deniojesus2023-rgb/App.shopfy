import type { ShopifyProductNode, ShopifyVariantNode } from "./graphql";

export interface ProductUpsertData {
  shopifyProductId: string;
  title: string;
  handle: string;
  description: string | null;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  featuredImageUrl: string | null;
  shopifyCreatedAt: Date;
  shopifyUpdatedAt: Date;
}

export interface VariantUpsertData {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  position: number;
  imageUrl: string | null;
  shopifyCreatedAt: Date;
  shopifyUpdatedAt: Date;
}

export function transformProductNode(node: ShopifyProductNode): ProductUpsertData {
  return {
    shopifyProductId: node.id,
    title: node.title,
    handle: node.handle,
    description: node.description,
    descriptionHtml: node.descriptionHtml,
    vendor: node.vendor,
    productType: node.productType,
    status: node.status,
    featuredImageUrl: node.featuredImage?.url ?? null,
    shopifyCreatedAt: new Date(node.createdAt),
    shopifyUpdatedAt: new Date(node.updatedAt),
  };
}

/**
 * `position` é derivada do índice de retorno — a Admin API não expõe mais
 * um campo `position` em ProductVariant (removido; a ordem da lista já É a
 * posição).
 */
export function transformVariantNodes(edges: Array<{ node: ShopifyVariantNode }>): VariantUpsertData[] {
  return edges.map(({ node }, index) => ({
    shopifyVariantId: node.id,
    title: node.title,
    sku: node.sku,
    barcode: node.barcode,
    price: node.price,
    compareAtPrice: node.compareAtPrice,
    inventoryQuantity: node.inventoryQuantity,
    availableForSale: node.availableForSale,
    position: index,
    imageUrl: node.image?.url ?? null,
    shopifyCreatedAt: new Date(node.createdAt),
    shopifyUpdatedAt: new Date(node.updatedAt),
  }));
}
