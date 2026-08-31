"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  changeMemberRoleAction,
  removeMemberAction,
} from "@/modules/workspaces/actions";
import type { WorkspaceRole } from "@prisma/client";

interface MemberRow {
  id: string;
  role: WorkspaceRole;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
}

export function MembersTable({
  workspaceSlug,
  members,
  currentUserId,
  canManage,
}: {
  workspaceSlug: string;
  members: MemberRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(memberId: string, role: WorkspaceRole) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("memberId", memberId);
      formData.set("role", role);
      const result = await changeMemberRoleAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  function handleRemove(memberId: string) {
    if (!confirm("Remover este membro do workspace?")) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("memberId", memberId);
      const result = await removeMemberAction(workspaceSlug, formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Membro</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              {canManage && <th className="px-4 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-neutral-200">
                <td className="px-4 py-3">
                  <div className="font-medium">{member.user.name ?? member.user.email}</div>
                  <div className="text-neutral-500">{member.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      defaultValue={member.role}
                      disabled={isPending}
                      onChange={(e) =>
                        handleRoleChange(member.id, e.target.value as WorkspaceRole)
                      }
                      className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                  ) : (
                    member.role
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    {member.user.id !== currentUserId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRemove(member.id)}
                      >
                        Remover
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
