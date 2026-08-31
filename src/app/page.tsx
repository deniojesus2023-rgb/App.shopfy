import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/workspaces");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">App.shopfy</h1>
      <p className="max-w-md text-neutral-600">
        Conecte suas lojas Shopify e crie funis de vendas gamificados com
        checkout COD e online — multi-tenant desde o primeiro dia.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Criar conta</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Entrar</Link>
        </Button>
      </div>
    </main>
  );
}
