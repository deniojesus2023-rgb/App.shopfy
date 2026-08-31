import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CatalogSyncRun } from "@prisma/client";

const STATUS_LABEL: Record<CatalogSyncRun["status"], string> = {
  PENDING: "Sincronização pendente",
  RUNNING: "Sincronizando...",
  COMPLETED: "Concluída",
  FAILED: "Erro na sincronização",
};

const STATUS_CLASS: Record<CatalogSyncRun["status"], string> = {
  PENDING: "bg-neutral-100 text-neutral-600",
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export function SyncStatusCard({ run }: { run: CatalogSyncRun | null }) {
  if (!run) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-neutral-500">
          Nenhuma sincronização executada ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Última sincronização</CardTitle>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[run.status]}`}>
          {STATUS_LABEL[run.status]}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm text-neutral-600">
        {run.finishedAt && <p>{run.finishedAt.toLocaleString("pt-BR")}</p>}
        <p>
          {run.productsProcessed} produtos · {run.variantsProcessed} variantes processados
        </p>
        {run.status === "FAILED" && run.error && <p className="text-red-600">{run.error}</p>}
      </CardContent>
    </Card>
  );
}
