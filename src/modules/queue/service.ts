import "server-only";

import crypto from "node:crypto";

import { Prisma, type BackgroundJob, type BackgroundJobType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { JOB_PAYLOAD_SCHEMAS, type BackgroundJobTypeName } from "./types";

const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 15 * 60_000; // 15min

function backoffDelayMs(attempts: number): number {
  const delay = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(delay, MAX_BACKOFF_MS);
}

// Infere o payload certo a partir de `type`, sem precisar importar os tipos
// individuais de cada job em todo call site de enqueueJob.
type PayloadFor<T extends BackgroundJobTypeName> = ReturnType<
  (typeof JOB_PAYLOAD_SCHEMAS)[T]["parse"]
>;

interface EnqueueInput<T extends BackgroundJobTypeName> {
  type: T;
  payload: PayloadFor<T>;
  workspaceId?: string;
  runAt?: Date;
  maxAttempts?: number;
}

// Client mínimo aceito por `enqueueJobInTx`: tanto o `prisma` singleton
// quanto o `tx` de dentro de um `prisma.$transaction(async (tx) => ...)`
// satisfazem isto — é o que permite o Order Engine (Fase 3) enfileirar
// SHOPIFY_ORDER_CREATE na MESMA transação que cria o Order, sem duplicar
// esta função nem depender de um outbox separado.
interface JobCreateClient {
  backgroundJob: { create: (args: { data: Prisma.BackgroundJobUncheckedCreateInput }) => Promise<BackgroundJob> };
}

export async function enqueueJobInTx<T extends BackgroundJobTypeName>(
  client: JobCreateClient,
  input: EnqueueInput<T>
): Promise<BackgroundJob> {
  const schema = JOB_PAYLOAD_SCHEMAS[input.type];
  const payload = schema.parse(input.payload);

  return client.backgroundJob.create({
    data: {
      type: input.type as BackgroundJobType,
      payload: payload as Prisma.InputJsonValue,
      workspaceId: input.workspaceId,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
    },
  });
}

export async function enqueueJob<T extends BackgroundJobTypeName>(
  input: EnqueueInput<T>
): Promise<BackgroundJob> {
  return enqueueJobInTx(prisma, input);
}

/**
 * Reivindica atomicamente até um job pendente (ou órfão) para este worker.
 * `FOR UPDATE SKIP LOCKED` é o padrão padrão de fila em Postgres: sob
 * concorrência, dois workers chamando isto ao mesmo tempo nunca recebem o
 * mesmo job — o segundo simplesmente pula a linha que o primeiro já travou.
 */
export async function claimNextJob(workerId: string = crypto.randomUUID()): Promise<BackgroundJob | null> {
  const rows = await prisma.$queryRaw<BackgroundJob[]>(Prisma.sql`
    UPDATE "background_jobs"
    SET "status" = 'PROCESSING'::"BackgroundJobStatus",
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "attempts" = "attempts" + 1,
        "updatedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "background_jobs"
      WHERE ("status" = 'PENDING'::"BackgroundJobStatus" AND "runAt" <= now())
         OR (
           "status" = 'PROCESSING'::"BackgroundJobStatus"
           -- Job travado em PROCESSING por mais de 5 minutos é considerado
           -- órfão (worker morreu no meio) e volta a ser elegível para claim.
           AND "lockedAt" < now() - interval '5 minutes'
         )
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);

  return rows[0] ?? null;
}

export async function completeJob(jobId: string): Promise<void> {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date(), lastError: null },
  });
}

interface FailJobOptions {
  /** false = falha terminal (ex.: token inválido) — nunca retenta, mesmo com attempts sobrando. */
  retryable?: boolean;
}

/**
 * Registra falha e decide entre reagendar (retry com backoff exponencial)
 * ou marcar como FAILED definitivo. Nunca loga o payload completo — só a
 * mensagem de erro, que não deve conter segredos (ver módulos Shopify:
 * nenhum erro interpola o access token).
 */
export async function failJob(
  jobId: string,
  error: unknown,
  options: FailJobOptions = {}
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });

  const retryable = options.retryable ?? true;
  const canRetry = retryable && job.attempts < job.maxAttempts;

  if (canRetry) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        runAt: new Date(Date.now() + backoffDelayMs(job.attempts)),
        lastError: message,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return;
  }

  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "FAILED", lastError: message },
  });
}
