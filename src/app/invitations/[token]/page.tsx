import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInvitationByToken } from "@/modules/workspaces/service";
import { AcceptInvitationButton } from "./accept-invitation-button";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { userId } = await auth();
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Convite não encontrado</CardTitle>
          </CardHeader>
          <CardContent>Este link de convite não é válido.</CardContent>
        </Card>
      </main>
    );
  }

  if (invitation.status !== "PENDING") {
    const statusLabel =
      invitation.status === "ACCEPTED"
        ? "já foi aceito"
        : invitation.status === "EXPIRED"
        ? "expirou"
        : "foi revogado";

    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Convite indisponível</CardTitle>
          </CardHeader>
          <CardContent>Este convite {statusLabel}.</CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Convite para {invitation.workspace.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            Você foi convidado como <strong>{invitation.role}</strong> para o e-mail{" "}
            <strong>{invitation.email}</strong>.
          </p>

          {!userId ? (
            <div className="flex gap-3">
              <Button asChild>
                <Link href={`/sign-in?redirect_url=/invitations/${token}`}>Entrar</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/sign-up?redirect_url=/invitations/${token}`}>Criar conta</Link>
              </Button>
            </div>
          ) : (
            <AcceptInvitationButton token={token} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
