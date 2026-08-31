import type { FunnelConfigV1 } from "@/modules/funnels/config/schema";
import type { FunnelStep, FunnelStepType } from "@/modules/funnels/config/steps";
import type { FunnelTheme } from "@/modules/funnels/config/theme";

export type SelectedPanel = { kind: "step"; stepId: string } | { kind: "theme" };

export interface BuilderState {
  /** Último config confirmado pelo servidor (revision correspondente). */
  originalConfig: FunnelConfigV1;
  /** Cópia de trabalho — tudo que o usuário está editando agora. */
  draftConfig: FunnelConfigV1;
  revision: number;
  selected: SelectedPanel;
  dirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error" | "conflict";
  saveError: string | null;
  previewDevice: "mobile" | "desktop";
}

export type BuilderAction =
  | { type: "SELECT_STEP"; stepId: string }
  | { type: "SELECT_THEME" }
  | { type: "UPDATE_STEP"; stepId: string; step: FunnelStep }
  | { type: "TOGGLE_STEP_ENABLED"; stepId: string }
  | { type: "MOVE_STEP"; stepId: string; direction: "up" | "down" }
  | { type: "UPDATE_THEME"; theme: FunnelTheme }
  | { type: "SET_PREVIEW_DEVICE"; device: "mobile" | "desktop" }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; revision: number }
  | { type: "SAVE_ERROR"; message: string }
  | { type: "SAVE_CONFLICT" }
  | { type: "DISMISS_CONFLICT" }
  | { type: "RELOAD_FROM_SERVER"; config: FunnelConfigV1; revision: number };

export function createBuilderState(config: FunnelConfigV1, revision: number): BuilderState {
  const firstStep = [...config.steps].sort((a, b) => a.order - b.order)[0];
  return {
    originalConfig: config,
    draftConfig: config,
    revision,
    selected: firstStep ? { kind: "step", stepId: firstStep.id } : { kind: "theme" },
    dirty: false,
    saveStatus: "idle",
    saveError: null,
    previewDevice: "mobile",
  };
}

/**
 * Renumera `order` 0..N-1 respeitando a ordem *posicional* atual do array
 * (não reordena por `order` — os chamadores já entregam o array na ordem
 * desejada, ex.: após um swap de MOVE_STEP; resortear aqui desfaria o swap).
 */
function renumberOrders(steps: FunnelStep[]): FunnelStep[] {
  return steps.map((step, index) => ({ ...step, order: index }) as FunnelStep);
}

function updateSteps(config: FunnelConfigV1, updater: (steps: FunnelStep[]) => FunnelStep[]): FunnelConfigV1 {
  return { ...config, steps: updater(config.steps) };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SELECT_STEP":
      return { ...state, selected: { kind: "step", stepId: action.stepId } };
    case "SELECT_THEME":
      return { ...state, selected: { kind: "theme" } };

    case "UPDATE_STEP":
      return {
        ...state,
        dirty: true,
        draftConfig: updateSteps(state.draftConfig, (steps) =>
          steps.map((s) => (s.id === action.stepId ? action.step : s))
        ),
      };

    case "TOGGLE_STEP_ENABLED":
      return {
        ...state,
        dirty: true,
        draftConfig: updateSteps(state.draftConfig, (steps) =>
          steps.map((s) => (s.id === action.stepId ? ({ ...s, enabled: !s.enabled } as FunnelStep) : s))
        ),
      };

    case "MOVE_STEP": {
      const ordered = [...state.draftConfig.steps].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((s) => s.id === action.stepId);
      const swapWith = action.direction === "up" ? index - 1 : index + 1;
      if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return state;

      const reordered = [...ordered];
      [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

      return {
        ...state,
        dirty: true,
        draftConfig: updateSteps(state.draftConfig, () => renumberOrders(reordered)),
      };
    }

    case "UPDATE_THEME":
      return { ...state, dirty: true, draftConfig: { ...state.draftConfig, theme: action.theme } };

    case "SET_PREVIEW_DEVICE":
      return { ...state, previewDevice: action.device };

    case "SAVE_START":
      return { ...state, saveStatus: "saving", saveError: null };

    case "SAVE_SUCCESS":
      return {
        ...state,
        saveStatus: "saved",
        saveError: null,
        dirty: false,
        revision: action.revision,
        originalConfig: state.draftConfig,
      };

    case "SAVE_ERROR":
      return { ...state, saveStatus: "error", saveError: action.message };

    case "SAVE_CONFLICT":
      return { ...state, saveStatus: "conflict" };

    case "DISMISS_CONFLICT":
      // "Mantener mis cambios temporalmente": fecha o modal, segue
      // editando local — dirty continua true, sem merge automático.
      return { ...state, saveStatus: "idle" };

    case "RELOAD_FROM_SERVER":
      return {
        ...state,
        originalConfig: action.config,
        draftConfig: action.config,
        revision: action.revision,
        dirty: false,
        saveStatus: "idle",
        saveError: null,
      };

    default:
      return state;
  }
}

export const STEP_TYPE_LABELS: Record<FunnelStepType, string> = {
  PRODUCT: "Producto",
  REWARD: "Recompensa",
  OFFER: "Oferta",
  PAYMENT_CHOICE: "Forma de pago",
  COD_FORM: "Formulario",
  SUCCESS: "Confirmación",
  UPSELL: "Upsell",
};
