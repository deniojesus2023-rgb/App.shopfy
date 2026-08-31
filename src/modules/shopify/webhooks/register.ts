import "server-only";

import { env } from "@/lib/env";
import { createShopifyGraphqlClient } from "../client";
import { REQUIRED_WEBHOOK_TOPICS, type WebhookTopicDefinition } from "./topics";

const REGISTER_MUTATION = /* GraphQL */ `
  mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      webhookSubscription {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

interface RegisterMutationResponse {
  webhookSubscriptionCreate: {
    webhookSubscription: { id: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

export interface WebhookRegistrationResult {
  topic: string;
  ok: boolean;
  error?: string;
}

async function registerSingleWebhook(
  client: ReturnType<typeof createShopifyGraphqlClient>,
  topic: WebhookTopicDefinition
): Promise<WebhookRegistrationResult> {
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/shopify/webhooks/${topic.urlSlug}`;

  try {
    const data = await client.request<RegisterMutationResponse>(REGISTER_MUTATION, {
      topic: topic.graphqlTopic,
      callbackUrl,
    });

    const userErrors = data.webhookSubscriptionCreate.userErrors;
    if (userErrors.length > 0) {
      return { topic: topic.header, ok: false, error: userErrors.map((e) => e.message).join("; ") };
    }
    return { topic: topic.header, ok: true };
  } catch (error) {
    return {
      topic: topic.header,
      ok: false,
      error: error instanceof Error ? error.message : "erro desconhecido",
    };
  }
}

/**
 * Registra todos os webhooks obrigatórios, incondicionalmente. Usado só na
 * conexão inicial da loja (Fase 1A). Falha em um tópico não derruba a
 * conexão — o resultado é retornado para o caller decidir se audita/alerta.
 */
export async function registerRequiredWebhooks(
  shopDomain: string,
  accessToken: string
): Promise<WebhookRegistrationResult[]> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);
  const results: WebhookRegistrationResult[] = [];
  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    results.push(await registerSingleWebhook(client, topic));
  }
  return results;
}

const LIST_SUBSCRIPTIONS_QUERY = /* GraphQL */ `
  query ExistingWebhookSubscriptions {
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
        }
      }
    }
  }
`;

interface ListSubscriptionsResponse {
  webhookSubscriptions: {
    edges: Array<{ node: { id: string; topic: string } }>;
  };
}

/**
 * Idempotente: consulta as subscriptions já registradas na loja, faz diff
 * contra `REQUIRED_WEBHOOK_TOPICS` e cria só as que faltam. Importante para
 * lojas conectadas antes de uma nova fase adicionar um tópico (ex.:
 * `products/delete` chegou na Fase 1B) — não exige reconectar a loja.
 * Nunca duplica: um tópico já presente é ignorado, não recriado.
 */
export async function ensureRequiredWebhooks(
  shopDomain: string,
  accessToken: string
): Promise<WebhookRegistrationResult[]> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);

  const existing = await client.request<ListSubscriptionsResponse>(LIST_SUBSCRIPTIONS_QUERY);
  const existingTopics = new Set(existing.webhookSubscriptions.edges.map((e) => e.node.topic));

  const missing = REQUIRED_WEBHOOK_TOPICS.filter((t) => !existingTopics.has(t.graphqlTopic));

  const results: WebhookRegistrationResult[] = [];
  for (const topic of missing) {
    results.push(await registerSingleWebhook(client, topic));
  }
  return results;
}
