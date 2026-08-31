import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Sincroniza User local com o Clerk. Verificação de assinatura via Svix é
 * obrigatória — sem ela, qualquer POST não autenticado poderia criar/editar
 * usuários locais. `requireUser()` também faz upsert como fallback caso
 * este webhook ainda não tenha sido processado, mas o caminho principal de
 * sincronização (incluindo `user.deleted`) é este.
 */
export async function POST(req: Request) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET não configurado");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(env.CLERK_WEBHOOK_SIGNING_SECRET);

  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as WebhookEvent;
  } catch (err) {
    console.error("[clerk-webhook] assinatura inválida", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const data = event.data;
      const primaryEmail = data.email_addresses.find(
        (e) => e.id === data.primary_email_address_id
      )?.email_address;

      if (!primaryEmail) break;

      await prisma.user.upsert({
        where: { clerkUserId: data.id },
        create: {
          clerkUserId: data.id,
          email: primaryEmail,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
          avatarUrl: data.image_url,
        },
        update: {
          email: primaryEmail,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
          avatarUrl: data.image_url,
        },
      });
      break;
    }
    case "user.deleted": {
      const clerkUserId = event.data.id;
      if (!clerkUserId) break;
      // Não removemos o User em cascata (preserva histórico de auditoria e
      // autoria de convites); apenas ficaria "orfão" de sessão Clerk.
      // Uma política de retenção/anonimização fica para uma fase futura.
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
