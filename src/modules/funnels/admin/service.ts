import "server-only";

import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/db";
import { logAudit } from "@/modules/audit/service";
import { ConflictError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { randomSlugSuffix, slugify } from "@/modules/shared/slug";
import type { User } from "@prisma/client";
import { migrateFunnelConfig } from "../config/migrate";
import { parseFunnelConfig } from "../config/parse";
import { CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION } from "../config/schema";
import { validateFunnelSemantics, type FunnelProductRef } from "../config/semantic-validation";
import { funnelPublicCacheTag } from "../runtime/cache";
import { generateFunnelPublicId } from "../runtime/public-id";

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listFunnels(workspaceId: string) {
  return prisma.funnel.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      publishedVersion: { select: { versionNumber: true } },
      products: {
        where: { role: "PRIMARY" },
        take: 1,
        include: { product: { select: { title: true, featuredImageUrl: true } } },
      },
    },
  });
}

export async function getFunnelForWorkspace(workspaceId: string, funnelId: string) {
  const funnel = await prisma.funnel.findFirst({
    where: { id: funnelId, workspaceId },
    include: {
      shopifyStore: { select: { id: true, shopDomain: true, displayName: true, currency: true } },
      publishedVersion: true,
      products: { include: { product: { select: { id: true, title: true, featuredImageUrl: true } } } },
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });
  if (!funnel) {
    throw new NotFoundError("Funil não encontrado.");
  }
  return funnel;
}

async function getActiveDraftVersion(funnelId: string) {
  return prisma.funnelVersion.findFirst({ where: { funnelId, status: "DRAFT" } });
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

async function generateUniqueFunnelSlug(workspaceId: string, name: string): Promise<string> {
  const base = slugify(name) || "funil";
  let candidate = base;

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.funnel.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: candidate } },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${randomSlugSuffix()}`;
  }

  throw new ValidationError("Não foi possível gerar um slug único para este funil.");
}

async function generateUniquePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateFunnelPublicId();
    const existing = await prisma.funnel.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new ValidationError("Não foi possível gerar um identificador público único.");
}

interface CreateFunnelInput {
  workspaceId: string;
  shopifyStoreId: string;
  productId: string;
  templateKey: string;
  name: string;
  slug?: string;
  user: User;
}

/**
 * Cria o Funnel e sua v1 DRAFT (config = template.defaultConfig) numa
 * transação — nunca existe um Funnel sem ao menos uma FunnelVersion.
 */
export async function createFunnel(input: CreateFunnelInput) {
  const template = await prisma.funnelTemplate.findUnique({ where: { key: input.templateKey } });
  if (!template || !template.isActive) {
    throw new ValidationError("Template inválido ou inativo.");
  }

  const store = await prisma.shopifyStore.findFirst({
    where: { id: input.shopifyStoreId, workspaceId: input.workspaceId },
  });
  if (!store) {
    throw new NotFoundError("Loja não encontrada.");
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, workspaceId: input.workspaceId, shopifyStoreId: input.shopifyStoreId },
  });
  if (!product) {
    throw new ValidationError("Produto não encontrado nesta loja/workspace.");
  }

  // Config do template já deve ser válido — mas nunca confiamos "porque é
  // nosso seed": parse com o mesmo schema usado para config de usuário.
  parseFunnelConfig(template.configSchemaVersion, template.defaultConfig);

  const slug = input.slug
    ? slugify(input.slug) || (await generateUniqueFunnelSlug(input.workspaceId, input.name))
    : await generateUniqueFunnelSlug(input.workspaceId, input.name);

  const existingSlug = await prisma.funnel.findUnique({
    where: { workspaceId_slug: { workspaceId: input.workspaceId, slug } },
  });
  if (existingSlug) {
    throw new ValidationError("Já existe um funil com este slug neste workspace.");
  }

  const publicId = await generateUniquePublicId();

  const funnel = await prisma.$transaction(async (tx) => {
    const created = await tx.funnel.create({
      data: {
        workspaceId: input.workspaceId,
        shopifyStoreId: input.shopifyStoreId,
        name: input.name,
        slug,
        publicId,
        status: "DRAFT",
        createdByUserId: input.user.id,
      },
    });

    await tx.funnelVersion.create({
      data: {
        workspaceId: input.workspaceId,
        funnelId: created.id,
        versionNumber: 1,
        configSchemaVersion: template.configSchemaVersion,
        config: template.defaultConfig as object,
        status: "DRAFT",
        revision: 0,
        createdByUserId: input.user.id,
      },
    });

    await tx.funnelProduct.create({
      data: {
        workspaceId: input.workspaceId,
        funnelId: created.id,
        productId: product.id,
        role: "PRIMARY",
      },
    });

    return created;
  });

  await logAudit({
    workspaceId: input.workspaceId,
    userId: input.user.id,
    action: "funnel.created",
    entityType: "Funnel",
    entityId: funnel.id,
    metadata: { name: input.name, slug, templateKey: input.templateKey, productId: product.id },
  });

  return funnel;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/**
 * Garante uma DRAFT editável para o funil. Se já existe uma (funil nunca
 * publicado, ou edição em andamento), retorna-a. Caso contrário, clona a
 * versão publicada (deep clone via JSON — o config é sempre JSON puro,
 * então isso é seguro) como a próxima versão DRAFT.
 *
 * Único caminho de código que cria uma FunnelVersion(status=DRAFT) — é
 * assim que garantimos "no máximo uma DRAFT ativa por funil" sem depender
 * de um índice parcial no banco (ver nota no schema Prisma).
 */
export async function getOrCreateDraftVersion(workspaceId: string, funnelId: string) {
  const existingDraft = await getActiveDraftVersion(funnelId);
  if (existingDraft) return existingDraft;

  const funnel = await prisma.funnel.findFirst({
    where: { id: funnelId, workspaceId },
    include: { publishedVersion: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!funnel) {
    throw new NotFoundError("Funil não encontrado.");
  }
  if (!funnel.publishedVersion) {
    throw new NotFoundError("Funil não possui versão publicada nem rascunho ativo.");
  }

  const nextVersionNumber = (funnel.versions[0]?.versionNumber ?? 0) + 1;
  const clonedConfig = JSON.parse(JSON.stringify(funnel.publishedVersion.config));

  return prisma.funnelVersion.create({
    data: {
      workspaceId,
      funnelId,
      versionNumber: nextVersionNumber,
      configSchemaVersion: funnel.publishedVersion.configSchemaVersion,
      config: clonedConfig,
      status: "DRAFT",
      revision: 0,
      createdByUserId: funnel.publishedVersion.createdByUserId,
    },
  });
}

interface UpdateDraftConfigInput {
  workspaceId: string;
  funnelId: string;
  versionId: string;
  expectedRevision: number;
  config: unknown;
  user: User;
}

/**
 * Optimistic concurrency: o `WHERE revision = expectedRevision` garante que
 * só uma das duas abas que editam o mesmo draft ao mesmo tempo consegue
 * salvar — a outra recebe ConflictError e precisa recarregar.
 */
export async function updateDraftConfig(input: UpdateDraftConfigInput) {
  const version = await prisma.funnelVersion.findFirst({
    where: { id: input.versionId, funnelId: input.funnelId, workspaceId: input.workspaceId },
  });
  if (!version) {
    throw new NotFoundError("Versão do funil não encontrada.");
  }
  if (version.status !== "DRAFT") {
    throw new ValidationError("Apenas uma versão DRAFT pode ser editada.");
  }

  // Valida estruturalmente antes de gravar — nunca persiste config inválido.
  // `parseFunnelConfig` sempre devolve o shape ATUAL (migra v1->v2 em
  // memória quando necessário) — todo save de draft grava esse shape e a
  // `configSchemaVersion` corrente junto (nunca deixa a coluna dizer "1"
  // enquanto o JSON já é v2; ver comentário em config/parse.ts). Isto só
  // vale para DRAFT — uma FunnelVersion PUBLISHED nunca passa por aqui
  // (guard `status !== "DRAFT"` acima).
  const parsed = parseFunnelConfig(version.configSchemaVersion, input.config);

  const result = await prisma.funnelVersion.updateMany({
    where: { id: version.id, revision: input.expectedRevision, status: "DRAFT" },
    // FunnelConfig é estruturalmente JSON puro (garantido pelo Zod), mas
    // seus literais/union types não satisfazem o índice `InputJsonObject`
    // do Prisma — o cast é seguro porque `parsed` só existe se passou pelo
    // parseFunnelConfig acima.
    data: {
      config: parsed as object,
      configSchemaVersion: CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION,
      revision: { increment: 1 },
    },
  });

  if (result.count === 0) {
    throw new ConflictError();
  }

  await logAudit({
    workspaceId: input.workspaceId,
    userId: input.user.id,
    action: "funnel.draft_updated",
    entityType: "FunnelVersion",
    entityId: version.id,
    metadata: { funnelId: input.funnelId, versionNumber: version.versionNumber },
  });

  return prisma.funnelVersion.findUniqueOrThrow({ where: { id: version.id } });
}

// ---------------------------------------------------------------------------
// Publicação
// ---------------------------------------------------------------------------

async function loadFunnelProductRefs(workspaceId: string, funnelId: string): Promise<FunnelProductRef[]> {
  const rows = await prisma.funnelProduct.findMany({
    where: { workspaceId, funnelId },
    include: { product: { select: { workspaceId: true, shopifyStoreId: true } } },
  });
  return rows.map((r) => ({
    productId: r.productId,
    role: r.role,
    product: r.product,
  }));
}

export async function publishFunnel(workspaceId: string, funnelId: string, user: User) {
  const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
  if (!funnel) {
    throw new NotFoundError("Funil não encontrado.");
  }
  if (funnel.status === "ARCHIVED") {
    throw new ValidationError("Funil arquivado não pode ser publicado.");
  }

  const draft = await getActiveDraftVersion(funnelId);
  if (!draft) {
    throw new ValidationError("Não há rascunho para publicar.");
  }

  const parsedConfig = parseFunnelConfig(draft.configSchemaVersion, draft.config);
  const funnelProducts = await loadFunnelProductRefs(workspaceId, funnelId);

  const semanticErrors = validateFunnelSemantics(parsedConfig, {
    workspaceId,
    shopifyStoreId: funnel.shopifyStoreId,
    funnelProducts,
  });
  if (semanticErrors.length > 0) {
    throw new ValidationError(
      `Funil inválido para publicação: ${semanticErrors.map((e) => `[${e.path}] ${e.message}`).join("; ")}`
    );
  }

  const primaryRef = funnelProducts.find((p) => p.role === "PRIMARY");
  if (!primaryRef) {
    throw new ValidationError("Funil sem produto principal (PRIMARY) — não é possível publicar.");
  }
  const snapshotSource = await loadPrimaryProductSnapshotSource(primaryRef.productId);

  const published = await prisma.$transaction(async (tx) => {
    if (funnel.publishedVersionId) {
      await tx.funnelVersion.update({
        where: { id: funnel.publishedVersionId },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });
    }

    const publishedVersion = await tx.funnelVersion.update({
      where: { id: draft.id },
      // Canoniza para o schema atual no exato momento em que este DRAFT
      // vira a nova versão imutável — isto não é "modificar uma versão
      // PUBLISHED histórica" (a linha ainda é um DRAFT até este update
      // dentro da mesma transação), é a única oportunidade de fazer o
      // storage bater com o `parsedConfig` já validado acima sem depender
      // de o lojista ter salvo o draft manualmente antes de publicar.
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        config: parsedConfig as object,
        configSchemaVersion: CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION,
      },
    });

    // Snapshot imutável do produto no momento da publicação — o storefront
    // público lê daqui, nunca do Product/ProductVariant ao vivo. Uma
    // FunnelVersion só é publicada uma vez (republicar cria uma nova
    // versão), então isto é sempre uma criação, nunca update.
    await tx.funnelProductSnapshot.create({
      data: {
        funnelVersionId: publishedVersion.id,
        productId: snapshotSource.productId,
        productVariantId: snapshotSource.productVariantId,
        shopifyProductId: snapshotSource.shopifyProductId,
        shopifyVariantId: snapshotSource.shopifyVariantId,
        variantTitle: snapshotSource.variantTitle,
        sku: snapshotSource.sku,
        title: snapshotSource.title,
        featuredImageUrl: snapshotSource.featuredImageUrl,
        unitPrice: snapshotSource.unitPrice,
        compareAtPrice: snapshotSource.compareAtPrice,
      },
    });

    await tx.funnel.update({
      where: { id: funnel.id },
      data: { publishedVersionId: publishedVersion.id, status: "PUBLISHED" },
    });

    return publishedVersion;
  });

  // Fora da transação (best-effort, não deve fazer a publicação falhar) —
  // é isto que faz a próxima leitura pública buscar a versão nova.
  revalidateTag(funnelPublicCacheTag(funnel.publicId));

  await logAudit({
    workspaceId,
    userId: user.id,
    action: "funnel.published",
    entityType: "Funnel",
    entityId: funnel.id,
    metadata: { versionNumber: published.versionNumber },
  });

  return published;
}

interface PrimaryProductSnapshotSource {
  productId: string;
  // Identidade da variante de onde `unitPrice` veio — congelada junto com o
  // preço para que o pedido saiba depois o que exatamente foi vendido.
  productVariantId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  variantTitle: string;
  sku: string | null;
  title: string;
  featuredImageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
}

async function loadPrimaryProductSnapshotSource(
  productId: string
): Promise<PrimaryProductSnapshotSource> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  });
  if (!product) {
    throw new ValidationError("Produto principal do funil não foi encontrado.");
  }

  const variant = product.variants[0];
  if (!variant) {
    throw new ValidationError("Produto principal não possui variantes disponíveis para publicar.");
  }

  return {
    productId: product.id,
    productVariantId: variant.id,
    shopifyProductId: product.shopifyProductId,
    shopifyVariantId: variant.shopifyVariantId,
    variantTitle: variant.title,
    sku: variant.sku,
    title: product.title,
    featuredImageUrl: product.featuredImageUrl,
    unitPrice: variant.price.toNumber(),
    compareAtPrice: variant.compareAtPrice?.toNumber() ?? null,
  };
}

export async function archiveFunnel(workspaceId: string, funnelId: string, user: User) {
  const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId } });
  if (!funnel) {
    throw new NotFoundError("Funil não encontrado.");
  }

  const updated = await prisma.funnel.update({
    where: { id: funnel.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  // Um funil arquivado deixa de ser servido publicamente — mesmo mecanismo
  // de invalidação usado na publicação.
  revalidateTag(funnelPublicCacheTag(funnel.publicId));

  await logAudit({
    workspaceId,
    userId: user.id,
    action: "funnel.archived",
    entityType: "Funnel",
    entityId: funnel.id,
  });

  return updated;
}

// Reexportado para os call sites que precisam montar o contrato de migração
// (Server Actions ainda não usam isto na Fase 2A — schema V1 é o único).
export { migrateFunnelConfig, CURRENT_FUNNEL_CONFIG_SCHEMA_VERSION };
