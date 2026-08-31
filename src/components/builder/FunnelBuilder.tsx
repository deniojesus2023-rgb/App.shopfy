"use client";

import { useEffect, useMemo, useReducer, useState } from "react";

import { publishFunnelAction, updateDraftConfigAction } from "@/modules/funnels/admin/actions";
import type { FunnelConfigV1 } from "@/modules/funnels/config/schema";
import { validateFunnelSemantics } from "@/modules/funnels/config/semantic-validation";
import type { ResolvedProductSnapshot } from "@/modules/funnels/runtime/resolve";
import { BuilderHeader } from "./BuilderHeader";
import { builderReducer, createBuilderState } from "./builder-state";
import { ConflictModal } from "./ConflictModal";
import { ValidationSummary } from "./components/ValidationSummary";
import type { UpsellProductRef } from "./editors/UpsellEditor";
import { PreviewPanel } from "./PreviewPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { PublishConfirmModal } from "./PublishConfirmModal";
import { StepSidebar } from "./StepSidebar";

export interface FunnelBuilderProps {
  workspaceSlug: string;
  funnel: { id: string; name: string; slug: string; publicId: string; shopifyStoreId: string };
  version: { id: string; config: FunnelConfigV1; revision: number };
  primaryProductId: string;
  snapshot: ResolvedProductSnapshot;
  initialUpsellProduct: UpsellProductRef | null;
  canEdit: boolean;
  canPublish: boolean;
}

export function FunnelBuilder({
  workspaceSlug,
  funnel,
  version,
  primaryProductId,
  snapshot,
  initialUpsellProduct,
  canEdit,
  canPublish,
}: FunnelBuilderProps) {
  const [state, dispatch] = useReducer(builderReducer, createBuilderState(version.config, version.revision));
  const [upsellProduct, setUpsellProduct] = useState(initialUpsellProduct);
  const [mobileTab, setMobileTab] = useState<"steps" | "config" | "preview">("steps");
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Validação semântica é só para a UX do builder (resumo de erros +
  // bloquear "Publicar"): usa `workspaceId: "self"` de propósito, porque o
  // client não tem (nem deveria ter) motivo para reconferir cross-tenant —
  // essa checagem real, com dados verdadeiros do banco, é feita de novo no
  // servidor por `publishFunnel`, que é a autoridade final.
  const semanticErrors = useMemo(() => {
    const funnelProducts = [
      { productId: primaryProductId, role: "PRIMARY" as const, product: { workspaceId: "self", shopifyStoreId: funnel.shopifyStoreId } },
      ...(upsellProduct
        ? [{ productId: upsellProduct.id, role: "UPSELL" as const, product: { workspaceId: "self", shopifyStoreId: funnel.shopifyStoreId } }]
        : []),
    ];
    return validateFunnelSemantics(state.draftConfig, {
      workspaceId: "self",
      shopifyStoreId: funnel.shopifyStoreId,
      funnelProducts,
    });
  }, [state.draftConfig, primaryProductId, upsellProduct, funnel.shopifyStoreId]);

  // Fecha o aviso de "não saia sem salvar" para navegação de fora do app
  // (fechar aba, recarregar). Navegação interna pelo próprio builder (botão
  // "← Funis") é tratada separadamente no BuilderHeader — não há como
  // interceptar de forma confiável qualquer link do resto do app a partir
  // daqui.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!state.dirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.dirty]);

  async function handleSave() {
    dispatch({ type: "SAVE_START" });
    const formData = new FormData();
    formData.set("versionId", version.id);
    formData.set("expectedRevision", String(state.revision));
    formData.set("configJson", JSON.stringify(state.draftConfig));

    const result = await updateDraftConfigAction(workspaceSlug, funnel.id, formData);
    if (!result.ok) {
      if (result.code === "CONFLICT") {
        dispatch({ type: "SAVE_CONFLICT" });
      } else {
        dispatch({ type: "SAVE_ERROR", message: result.error });
      }
      return;
    }
    dispatch({ type: "SAVE_SUCCESS", revision: result.data.revision });
  }

  async function handleReloadFromServer() {
    // A forma mais simples e segura de "recarregar a versão atual" sem
    // duplicar lógica de leitura é recarregar a página inteira — o server
    // component busca o draft mais recente do banco.
    window.location.reload();
  }

  async function handlePublish() {
    setIsPublishing(true);
    setPublishError(null);
    const formData = new FormData();
    formData.set("funnelId", funnel.id);
    const result = await publishFunnelAction(workspaceSlug, formData);
    setIsPublishing(false);
    if (!result.ok) {
      setPublishError(result.error);
      return;
    }
    setShowPublishConfirm(false);
    window.location.href = `/${workspaceSlug}/funnels/${funnel.id}`;
  }

  const publishBlockedReason = !canPublish
    ? "Você não tem permissão para publicar."
    : semanticErrors.length > 0
      ? "Resolva os problemas de validação antes de publicar."
      : state.dirty
        ? "Salve as alterações antes de publicar."
        : null;

  const previewProps = {
    state,
    dispatch,
    funnelMeta: { id: funnel.id, name: funnel.name, slug: funnel.slug, publicId: funnel.publicId, versionId: version.id },
    snapshot,
    upsellProduct,
  };

  const propertiesProps = {
    state,
    dispatch,
    workspaceSlug,
    funnelId: funnel.id,
    shopifyStoreId: funnel.shopifyStoreId,
    unitPrice: snapshot.unitPrice,
    upsellProduct,
    onUpsellProductChange: setUpsellProduct,
  };

  return (
    <div className="flex h-screen flex-col">
      <BuilderHeader
        workspaceSlug={workspaceSlug}
        funnelId={funnel.id}
        funnelName={funnel.name}
        state={state}
        canEdit={canEdit}
        canPublish={canPublish}
        publishBlockedReason={publishBlockedReason}
        onSave={handleSave}
        onPublishClick={() => setShowPublishConfirm(true)}
      />

      {semanticErrors.length > 0 && (
        <div className="border-b border-neutral-200 px-4 py-2">
          <ValidationSummary errors={semanticErrors} />
        </div>
      )}

      {/* Desktop: três colunas fixas. Mobile: tabs (nunca três colunas espremidas). */}
      <div className="hidden flex-1 overflow-hidden md:grid md:grid-cols-[220px_1fr_minmax(360px,480px)]">
        <div className="overflow-y-auto border-r border-neutral-200 p-3">
          <StepSidebar state={state} dispatch={dispatch} semanticErrors={semanticErrors} readOnly={!canEdit} />
        </div>
        <div className="overflow-y-auto p-4">
          <PropertiesPanel {...propertiesProps} />
        </div>
        <div className="overflow-hidden border-l border-neutral-200 p-3">
          <PreviewPanel {...previewProps} />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        <div className="flex border-b border-neutral-200 text-sm">
          {(["steps", "config", "preview"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              aria-current={mobileTab === tab ? "true" : undefined}
              className={`flex-1 px-3 py-2 ${mobileTab === tab ? "border-b-2 border-neutral-900 font-medium" : "text-neutral-500"}`}
            >
              {tab === "steps" ? "Etapas" : tab === "config" ? "Configuración" : "Vista previa"}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {mobileTab === "steps" && (
            <StepSidebar state={state} dispatch={dispatch} semanticErrors={semanticErrors} readOnly={!canEdit} />
          )}
          {mobileTab === "config" && <PropertiesPanel {...propertiesProps} />}
          {mobileTab === "preview" && <PreviewPanel {...previewProps} />}
        </div>
      </div>

      {state.saveStatus === "conflict" && (
        <ConflictModal onReload={handleReloadFromServer} onKeepEditing={() => dispatch({ type: "DISMISS_CONFLICT" })} />
      )}

      {showPublishConfirm && (
        <PublishConfirmModal
          isPending={isPublishing}
          onConfirm={handlePublish}
          onCancel={() => {
            setShowPublishConfirm(false);
            setPublishError(null);
          }}
        />
      )}
      {publishError && <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm text-white">{publishError}</p>}
    </div>
  );
}
