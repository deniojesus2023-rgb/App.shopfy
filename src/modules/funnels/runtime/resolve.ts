import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db";
import { parseFunnelConfig } from "../config/parse";
import type { FunnelConfig } from "../config/schema";
import { funnelPublicCacheTag } from "./cache";

export interface ResolvedProductSnapshot {
  title: string;
  featuredImageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
}

export interface ResolvedUpsellProduct {
  title: string;
  featuredImageUrl: string | null;
}

export interface ResolvedFunnel {
  funnel: { id: string; name: string; slug: string; publicId: string };
  version: { id: string; versionNumber: number };
  config: FunnelConfig;
  snapshot: ResolvedProductSnapshot;
  /** ISO 4217 — sempre a da ShopifyStore do funil (Fase 4A). Nunca escolhida no client. */
  currency: string;
  // Decorativo apenas (título/imagem) — não é um snapshot congelado como o
  // produto principal; não há preço de upsell nesta fase.
  upsellProduct: ResolvedUpsellProduct | null;
  /** true quando é um preview de rascunho (nunca cacheado, nunca indexável). */
  isPreview: boolean;
}

async function loadUpsellProduct(funnelId: string): Promise<ResolvedUpsellProduct | null> {
  const upsell = await prisma.funnelProduct.findFirst({
    where: { funnelId, role: "UPSELL" },
    include: { product: { select: { title: true, featuredImageUrl: true } } },
  });
  return upsell ? { title: upsell.product.title, featuredImageUrl: upsell.product.featuredImageUrl } : null;
}

/**
 * Resolve um funil PUBLICADO pelo `publicId`. Único critério de
 * legitimidade: `funnel.status === PUBLISHED` e a versão referenciada por
 * `publishedVersionId` também está `PUBLISHED` (checagem redundante
 * deliberada — nunca confiar em só um dos dois). Nunca recebe nem usa
 * `workspaceId`/`shopifyStoreId` do chamador. Falha fechada: qualquer
 * inconsistência retorna `null`, nunca lança para o caller renderizar 404.
 */
async function resolvePublishedFunnelUncached(publicId: string): Promise<ResolvedFunnel | null> {
  const funnel = await prisma.funnel.findUnique({
    where: { publicId },
    select: {
      id: true,
      name: true,
      slug: true,
      publicId: true,
      status: true,
      publishedVersionId: true,
      shopifyStore: { select: { currency: true } },
    },
  });

  if (!funnel || funnel.status !== "PUBLISHED" || !funnel.publishedVersionId) {
    return null;
  }

  const version = await prisma.funnelVersion.findUnique({
    where: { id: funnel.publishedVersionId },
    include: { productSnapshot: true },
  });

  if (!version || version.status !== "PUBLISHED" || version.funnelId !== funnel.id) {
    return null;
  }
  if (!version.productSnapshot) {
    return null;
  }

  let config: FunnelConfig;
  try {
    config = parseFunnelConfig(version.configSchemaVersion, version.config);
  } catch {
    // Config corrompido/incompatível nunca deve vazar para o público —
    // falha fechada, mesmo resultado de "não existe".
    return null;
  }

  return {
    funnel: { id: funnel.id, name: funnel.name, slug: funnel.slug, publicId: funnel.publicId },
    version: { id: version.id, versionNumber: version.versionNumber },
    config,
    snapshot: {
      title: version.productSnapshot.title,
      featuredImageUrl: version.productSnapshot.featuredImageUrl,
      unitPrice: version.productSnapshot.unitPrice.toNumber(),
      compareAtPrice: version.productSnapshot.compareAtPrice?.toNumber() ?? null,
    },
    currency: funnel.shopifyStore.currency,
    upsellProduct: await loadUpsellProduct(funnel.id),
    isPreview: false,
  };
}

export async function resolvePublicFunnel(publicId: string): Promise<ResolvedFunnel | null> {
  const cached = unstable_cache(
    () => resolvePublishedFunnelUncached(publicId),
    ["funnel-public", publicId],
    { tags: [funnelPublicCacheTag(publicId)], revalidate: 300 }
  );
  return cached();
}

/**
 * Resolve uma versão (qualquer status) para preview autenticado por token
 * — nunca por ID previsível. Como uma DRAFT nunca tem
 * `FunnelProductSnapshot` (só é criado na publicação), o preview monta um
 * snapshot "ao vivo" a partir do catálogo atual — correto para preview
 * (ainda não há nada "congelado" para mostrar) e nunca usado na rota
 * pública real.
 */
export async function resolveFunnelVersionForPreview(
  funnelId: string,
  versionId: string
): Promise<ResolvedFunnel | null> {
  const version = await prisma.funnelVersion.findFirst({
    where: { id: versionId, funnelId },
    include: {
      funnel: {
        select: { id: true, name: true, slug: true, publicId: true, shopifyStore: { select: { currency: true } } },
      },
      productSnapshot: true,
    },
  });
  if (!version) return null;

  let config: FunnelConfig;
  try {
    config = parseFunnelConfig(version.configSchemaVersion, version.config);
  } catch {
    return null;
  }

  const snapshot = version.productSnapshot
    ? {
        title: version.productSnapshot.title,
        featuredImageUrl: version.productSnapshot.featuredImageUrl,
        unitPrice: version.productSnapshot.unitPrice.toNumber(),
        compareAtPrice: version.productSnapshot.compareAtPrice?.toNumber() ?? null,
      }
    : await liveProductSnapshotForFunnel(funnelId);

  if (!snapshot) return null;

  return {
    funnel: version.funnel,
    version: { id: version.id, versionNumber: version.versionNumber },
    config,
    snapshot,
    currency: version.funnel.shopifyStore.currency,
    upsellProduct: await loadUpsellProduct(funnelId),
    isPreview: true,
  };
}

async function liveProductSnapshotForFunnel(funnelId: string): Promise<ResolvedProductSnapshot | null> {
  const primary = await prisma.funnelProduct.findFirst({
    where: { funnelId, role: "PRIMARY" },
    include: {
      product: {
        include: { variants: { where: { deletedAt: null }, orderBy: { position: "asc" }, take: 1 } },
      },
    },
  });

  const variant = primary?.product.variants[0];
  if (!primary || !variant) return null;

  return {
    title: primary.product.title,
    featuredImageUrl: primary.product.featuredImageUrl,
    unitPrice: variant.price.toNumber(),
    compareAtPrice: variant.compareAtPrice?.toNumber() ?? null,
  };
}
