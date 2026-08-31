// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FunnelConfigV1 } from "@/modules/funnels/config/schema";
import { FunnelBuilder, type FunnelBuilderProps } from "./FunnelBuilder";

const updateDraftConfigActionMock = vi.fn();
const publishFunnelActionMock = vi.fn();

vi.mock("@/modules/funnels/admin/actions", () => ({
  updateDraftConfigAction: (...args: unknown[]) => updateDraftConfigActionMock(...args),
  publishFunnelAction: (...args: unknown[]) => publishFunnelActionMock(...args),
}));

vi.mock("@/modules/funnels/admin/product-actions", () => ({
  searchStoreProductsAction: vi.fn(async () => ({ ok: true, data: { items: [], nextCursor: null } })),
  setUpsellProductAction: vi.fn(),
}));

const theme = {
  primaryColor: "#111827",
  backgroundColor: "#FFFFFF",
  textColor: "#111827",
  mutedColor: "#6B7280",
  borderRadius: "MEDIUM" as const,
  fontFamily: "SYSTEM" as const,
  buttonStyle: "SOLID" as const,
};

function buildConfig(): FunnelConfigV1 {
  return {
    schemaVersion: 1,
    theme,
    settings: {},
    steps: [
      {
        id: "product",
        type: "PRODUCT",
        enabled: true,
        order: 0,
        config: { showRating: false, showBenefits: false, benefits: [], showCompareAtPrice: false, ctaText: "Comprar" },
      },
      {
        id: "success",
        type: "SUCCESS",
        enabled: true,
        order: 1,
        config: { title: "Sucesso", showOrderNumber: true, showRewardProgress: false },
      },
    ],
  };
}

function baseProps(overrides: Partial<FunnelBuilderProps> = {}): FunnelBuilderProps {
  return {
    workspaceSlug: "acme",
    funnel: { id: "funnel-1", name: "Meu Funil", slug: "meu-funil", publicId: "pub1", shopifyStoreId: "store-1" },
    version: { id: "version-1", config: buildConfig(), revision: 1 },
    primaryProductId: "prod-1",
    snapshot: { title: "Produto", featuredImageUrl: null, unitPrice: 100, compareAtPrice: null },
    initialUpsellProduct: null,
    canEdit: true,
    canPublish: true,
    ...overrides,
  };
}

beforeEach(() => {
  updateDraftConfigActionMock.mockReset();
  publishFunnelActionMock.mockReset();
});

describe("FunnelBuilder", () => {
  it("marca dirty ao editar um step e mostra 'Cambios sin guardar'", async () => {
    const user = userEvent.setup();
    render(<FunnelBuilder {...baseProps()} />);

    const ctaInputs = screen.getAllByLabelText("Texto do botão");
    await user.type(ctaInputs[0], "!");

    expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("salva com sucesso: chama a action e mostra 'Guardado'", async () => {
    updateDraftConfigActionMock.mockResolvedValue({ ok: true, data: { revision: 2 } });
    const user = userEvent.setup();
    render(<FunnelBuilder {...baseProps()} />);

    const ctaInputs = screen.getAllByLabelText("Texto do botão");
    await user.type(ctaInputs[0], "!");
    await user.click(screen.getByText("Guardar cambios"));

    await waitFor(() => expect(screen.getByText("Guardado")).toBeInTheDocument());
    expect(updateDraftConfigActionMock).toHaveBeenCalledWith("acme", "funnel-1", expect.any(FormData));
  });

  it("conflito de revisão mostra o modal com as duas opções, sem merge automático", async () => {
    updateDraftConfigActionMock.mockResolvedValue({ ok: false, error: "conflito", code: "CONFLICT" });
    const user = userEvent.setup();
    render(<FunnelBuilder {...baseProps()} />);

    const ctaInputs = screen.getAllByLabelText("Texto do botão");
    await user.type(ctaInputs[0], "!");
    await user.click(screen.getByText("Guardar cambios"));

    expect(await screen.findByText("Este embudo fue modificado en otra sesión.")).toBeInTheDocument();
    expect(screen.getByText("Recargar versión actual")).toBeInTheDocument();
    expect(screen.getByText("Mantener mis cambios temporalmente")).toBeInTheDocument();
  });

  it("'Mantener mis cambios' fecha o modal sem descartar o draft (dirty continua true)", async () => {
    updateDraftConfigActionMock.mockResolvedValue({ ok: false, error: "conflito", code: "CONFLICT" });
    const user = userEvent.setup();
    render(<FunnelBuilder {...baseProps()} />);

    const ctaInputs = screen.getAllByLabelText("Texto do botão");
    await user.type(ctaInputs[0], "!");
    await user.click(screen.getByText("Guardar cambios"));
    await screen.findByText("Este embudo fue modificado en otra sesión.");

    await user.click(screen.getByText("Mantener mis cambios temporalmente"));

    expect(screen.queryByText("Este embudo fue modificado en otra sesión.")).not.toBeInTheDocument();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
  });

  it("bloqueia Publicar quando há erro de validação semântica (falta SUCCESS)", () => {
    const config = buildConfig();
    config.steps = [config.steps[0]];
    render(<FunnelBuilder {...baseProps({ version: { id: "version-1", config, revision: 1 } })} />);

    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  });

  it("permite Publicar quando o config é válido e não há alterações pendentes", () => {
    render(<FunnelBuilder {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Publicar" })).not.toBeDisabled();
  });

  it("modo somente leitura (canEdit=false) não mostra controles de edição", () => {
    render(<FunnelBuilder {...baseProps({ canEdit: false })} />);
    expect(screen.queryByText("Guardar cambios")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Habilitar Producto/)).not.toBeInTheDocument();
  });

  it("canPublish=false esconde o botão Publicar", () => {
    render(<FunnelBuilder {...baseProps({ canPublish: false })} />);
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });
});
