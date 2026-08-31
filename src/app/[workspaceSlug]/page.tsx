import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace, role } = await requireWorkspaceMember(workspaceSlug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        <p className="text-neutral-600">Seu papel neste workspace: {role}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fase 0 concluída</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600">
          Autenticação, workspaces, membros, papéis e auditoria estão prontos.
          As próximas fases (conexão Shopify, funis, COD) serão construídas
          dentro deste mesmo isolamento de tenant.
        </CardContent>
      </Card>
    </div>
  );
}
