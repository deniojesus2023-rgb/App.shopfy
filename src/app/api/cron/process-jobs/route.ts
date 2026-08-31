import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { failSyncRun } from "@/modules/catalog/sync-run";
import { NonRetryableJobError } from "@/modules/queue/errors";
import { claimNextJob, completeJob, failJob } from "@/modules/queue/service";
import { shopifyFullCatalogSyncPayloadSchema } from "@/modules/queue/types";
import { dispatchJob } from "@/modules/queue/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

// Quantos jobs esta invocação processa antes de devolver a resposta ao
// cron. Cada full-sync avança uma página por job — um catálogo grande leva
// vários disparos do cron (a cada minuto) para terminar; isso é deliberado,
// não um bug: evita estourar o timeout de uma function serverless.
const MAX_JOBS_PER_TICK = 5;

async function finalizeTerminalFailure(jobId: string) {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "FAILED" || job.type !== "SHOPIFY_FULL_CATALOG_SYNC") return;

  const parsed = shopifyFullCatalogSyncPayloadSchema.safeParse(job.payload);
  if (!parsed.success) return;

  await failSyncRun(parsed.data.syncRunId, job.lastError ?? "Job falhou após esgotar as tentativas.");
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
    const job = await claimNextJob();
    if (!job) break;

    processed += 1;

    try {
      await dispatchJob(job);
      await completeJob(job.id);
    } catch (error) {
      const retryable = !(error instanceof NonRetryableJobError);
      // Nunca logar `job.payload` inteiro — apenas id/type, que não
      // carregam segredo nenhum (tokens nunca entram em payload de job).
      console.error(`[jobs] job ${job.id} (${job.type}) failed`, error);
      await failJob(job.id, error, { retryable });
      await finalizeTerminalFailure(job.id);
    }
  }

  return NextResponse.json({ processed });
}
