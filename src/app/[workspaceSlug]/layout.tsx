import Link from "next/link";
import { notFound } from "next/navigation";

import { NotFoundError } from "@/modules/shared/errors";
import { requireWorkspaceMember } from "@/modules/workspaces/tenant";

/**
 * Todo o subtree `/[workspaceSlug]/**` passa por este layout antes de
 * renderizar. `requireWorkspaceMember` já garante autenticação + membership
 * — se o usuário não pertence a este workspace, cai em 404 (não 403: nunca
 * confirmamos a existência de um workspace alheio).
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  try {
    const { workspace, role } = await requireWorkspaceMember(workspaceSlug);

    return (
      <div className="min-h-screen">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <Link href="/workspaces" className="font-semibold">
                App.shopfy
              </Link>
              <nav className="flex gap-4 text-sm text-neutral-600">
                <Link href={`/${workspace.slug}`}>Dashboard</Link>
                <Link href={`/${workspace.slug}/members`}>Membros</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <span className="font-medium text-neutral-900">{workspace.name}</span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{role}</span>
              <Link href="/workspaces" className="underline-offset-2 hover:underline">
                Trocar
              </Link>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }
}
