/**
 * Único lugar que mapeia um tópico de webhook nas três formas que ele
 * aparece no sistema: o enum da GraphQL Admin API (para registrar), o
 * valor real do header `X-Shopify-Topic` (para persistir/comparar) e o
 * slug de URL (Next não aceita "/" dentro de um segmento de rota, então o
 * endpoint é `/api/shopify/webhooks/app-uninstalled`, não `.../app/uninstalled`).
 */
export interface WebhookTopicDefinition {
  urlSlug: string;
  header: string;
  graphqlTopic: string;
}

export const REQUIRED_WEBHOOK_TOPICS: WebhookTopicDefinition[] = [
  { urlSlug: "app-uninstalled", header: "app/uninstalled", graphqlTopic: "APP_UNINSTALLED" },
  { urlSlug: "products-update", header: "products/update", graphqlTopic: "PRODUCTS_UPDATE" },
  { urlSlug: "orders-create", header: "orders/create", graphqlTopic: "ORDERS_CREATE" },
  { urlSlug: "orders-updated", header: "orders/updated", graphqlTopic: "ORDERS_UPDATED" },
  {
    urlSlug: "fulfillments-create",
    header: "fulfillments/create",
    graphqlTopic: "FULFILLMENTS_CREATE",
  },
];

export function findTopicByUrlSlug(urlSlug: string): WebhookTopicDefinition | undefined {
  return REQUIRED_WEBHOOK_TOPICS.find((t) => t.urlSlug === urlSlug);
}
