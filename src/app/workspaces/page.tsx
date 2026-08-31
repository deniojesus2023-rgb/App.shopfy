import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/modules/identity/service";
import { listWorkspacesForUser } from "@/modules/workspaces/service";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const memberships = await listWorkspacesForUser(user.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Seus workspaces</h1>
        <p className="text-neutral-600">
          Cada workspace isola lojas, produtos, funis e pedidos — você só vê o que pertence a ele.
        </p>
      </div>

      {memberships.length > 0 && (
        <ul className="flex flex-col gap-3">
          {memberships.map(({ workspace, role }) => (
            <li key={workspace.id}>
              <Link href={`/${workspace.slug}`}>
                <Card className="transition-colors hover:border-neutral-400">
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle>{workspace.name}</CardTitle>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                      {role}
                    </span>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Criar novo workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </main>
  );
}
