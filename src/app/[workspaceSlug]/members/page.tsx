import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers, listPendingInvitations } from "@/modules/workspaces/service";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";
import { roleHasPermission } from "@/modules/workspaces/permissions";
import { InviteMemberForm } from "./invite-member-form";
import { MembersTable } from "./members-table";
import { PendingInvitations } from "./pending-invitations";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const ctx = await requireWorkspaceMember(workspaceSlug);

  const canManage = roleHasPermission(ctx.role, "workspace:manage_members");

  const [members, invitations] = await Promise.all([
    listMembers(ctx.workspace.id),
    canManage ? listPendingInvitations(ctx.workspace.id) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Membros</h1>
        <p className="text-neutral-600">
          Quem tem acesso a {ctx.workspace.name} e com qual papel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipe</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable
            workspaceSlug={workspaceSlug}
            members={members}
            currentUserId={ctx.user.id}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      {canManage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Convidar membro</CardTitle>
            </CardHeader>
            <CardContent>
              <InviteMemberForm workspaceSlug={workspaceSlug} />
            </CardContent>
          </Card>

          {invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Convites pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <PendingInvitations workspaceSlug={workspaceSlug} invitations={invitations} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
