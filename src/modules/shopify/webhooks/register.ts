import "server-only";

import { env } from "@/lib/env";
import { createShopifyGraphqlClient } from "../client";
import { REQUIRED_WEBHOOK_TOPICS } from "./topics";

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

/**
 * Registra os webhooks obrigatórios na loja recém-conectada. Falha em um
 * tópico não deve derrubar a conexão inteira — a loja fica conectada mesmo
 * que um registro específico falhe; o resultado é retornado para o caller
 * decidir se audita/alerta.
 */
export async function registerRequiredWebhooks(
  shopDomain: string,
  accessToken: string
): Promise<WebhookRegistrationResult[]> {
  const client = createShopifyGraphqlClient(shopDomain, accessToken);
  const results: WebhookRegistrationResult[] = [];

  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/shopify/webhooks/${topic.urlSlug}`;

    try {
      const data = await client.request<RegisterMutationResponse>(REGISTER_MUTATION, {
        topic: topic.graphqlTopic,
        callbackUrl,
      });

      const userErrors = data.webhookSubscriptionCreate.userErrors;
      if (userErrors.length > 0) {
        results.push({
          topic: topic.header,
          ok: false,
          error: userErrors.map((e) => e.message).join("; "),
        });
        continue;
      }

      results.push({ topic: topic.header, ok: true });
    } catch (error) {
      results.push({
        topic: topic.header,
        ok: false,
        error: error instanceof Error ? error.message : "erro desconhecido",
      });
    }
  }

  return results;
}
