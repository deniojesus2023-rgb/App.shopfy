import "server-only";

// Uma página traz o produto E todas as suas variantes numa query só — a
// Shopify limita produtos a no máximo 100 variantes, então `first: 100`
// cobre sempre a lista inteira, sem paginação aninhada e sem N+1 (nunca
// precisamos de uma segunda query por produto para buscar variantes).
export const CATALOG_PAGE_QUERY = /* GraphQL */ `
  query CatalogPage($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: ID) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          description
          descriptionHtml
          vendor
          productType
          status
          featuredImage {
            url
          }
          createdAt
          updatedAt
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                inventoryQuantity
                availableForSale
                image {
                  url
                }
                createdAt
                updatedAt
              }
            }
          }
        }
      }
    }
  }
`;

export interface ShopifyVariantNode {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  image: { url: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  featuredImage: { url: string } | null;
  createdAt: string;
  updatedAt: string;
  variants: { edges: Array<{ node: ShopifyVariantNode }> };
}

export interface CatalogPageResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifyProductNode }>;
  };
}

/** Mesma seleção de campos do produto, para buscar um único produto por GID (webhook-triggered sync). */
export const SINGLE_PRODUCT_QUERY = /* GraphQL */ `
  query SingleProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      description
      descriptionHtml
      vendor
      productType
      status
      featuredImage {
        url
      }
      createdAt
      updatedAt
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            barcode
            price
            compareAtPrice
            inventoryQuantity
            availableForSale
            image {
              url
            }
            createdAt
            updatedAt
          }
        }
      }
    }
  }
`;

export interface SingleProductResponse {
  product: ShopifyProductNode | null;
}
