import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_domain: "Domínio Shopify inválido. Use o formato minha-loja.myshopify.com.",
  invalid_hmac: "Não foi possível verificar a autenticidade da resposta da Shopify.",
  invalid_state: "Sessão de conexão expirada ou inválida. Tente novamente.",
  connect_failed: "Não foi possível concluir a conexão com a Shopify. Tente novamente.",
  forbidden: "Você não tem permissão para conectar lojas neste workspace.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde um momento e tente de novo.",
  unexpected: "Ocorreu um erro inesperado. Tente novamente.",
};

export function ConnectStoreForm({
  workspaceSlug,
  errorCode,
}: {
  workspaceSlug: string;
  errorCode?: string;
}) {
  return (
    <form action="/api/shopify/oauth/install" method="POST" className="flex flex-col gap-3">
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shopDomainInput">Domínio da loja Shopify</Label>
          <Input
            id="shopDomainInput"
            name="shopDomainInput"
            placeholder="minha-loja.myshopify.com"
            required
          />
        </div>
        <div className="flex items-end">
          <Button type="submit">Conectar Shopify</Button>
        </div>
      </div>
      {errorCode && (
        <p className="text-sm text-red-600">
          {ERROR_MESSAGES[errorCode] ?? "Não foi possível conectar a loja."}
        </p>
      )}
    </form>
  );
}
