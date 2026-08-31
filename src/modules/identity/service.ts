import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import { UnauthorizedError } from "@/modules/shared/errors";
import type { User } from "@prisma/client";

/**
 * Garante que existe uma sessão Clerk válida e retorna o `User` local
 * correspondente, criando-o na primeira vez que este clerkUserId aparece
 * (fallback caso o webhook `user.created` ainda não tenha processado —
 * nunca dependa só de webhook para algo que bloqueia o usuário).
 */
export async function requireUser(): Promise<User> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new UnauthorizedError();
  }

  const existing = await prisma.user.findUnique({ where: { clerkUserId } });
  if (existing) {
    return existing;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    throw new UnauthorizedError();
  }

  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;

  if (!primaryEmail) {
    throw new UnauthorizedError("Conta sem e-mail verificado.");
  }

  return prisma.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email: primaryEmail,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: clerkUser.imageUrl,
    },
    update: {
      email: primaryEmail,
    },
  });
}

/** Versão que não lança — para uso em pontos que renderizam UI condicional (ex.: navbar). */
export async function getOptionalUser(): Promise<User | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
