import deepEqual from "fast-deep-equal";
import type {
  PosActiveOrderSnapshot,
  DisplayOptionsModalSync,
  DisplayAllergenModalSync,
  DisplayRecommendedModalSync,
  DisplaySurveyPrompt,
} from "@/types/pos";

export interface PosDisplayState {
  displayCompletedSurveyContext: {
    sessionId: string;
    orderId: string | null;
    saleId: string | null;
  } | null;
  setDisplayCompletedSurveyContext: (
    payload: PosDisplayState["displayCompletedSurveyContext"]
  ) => void;

  activeDisplayOrder: PosActiveOrderSnapshot[] | null;
  setActiveDisplayOrder: (items: PosActiveOrderSnapshot[] | null) => void;

  displayMetadata: {
    isPaymentMode: boolean;
    paymentMethod: string | null;
    isProcessing: boolean;
  };
  setDisplayMetadata: (metadata: Partial<PosDisplayState["displayMetadata"]>) => void;

  displayOptionsModal: DisplayOptionsModalSync | null;
  setDisplayOptionsModal: (payload: DisplayOptionsModalSync | null) => void;

  displayAllergenModal: DisplayAllergenModalSync | null;
  setDisplayAllergenModal: (payload: DisplayAllergenModalSync | null) => void;

  displayRecommendedModal: DisplayRecommendedModalSync | null;
  setDisplayRecommendedModal: (payload: DisplayRecommendedModalSync | null) => void;

  displaySurveyPrompt: DisplaySurveyPrompt | null;
  setDisplaySurveyPrompt: (payload: DisplaySurveyPrompt | null) => void;

  displaySuccessSignal: "ORDER" | "PAYMENT" | null;
  setDisplaySuccessSignal: (type: "ORDER" | "PAYMENT" | null) => void;
}

export function createPosDisplaySlice(
  set: (partial: Partial<PosDisplayState> | ((state: PosDisplayState) => Partial<PosDisplayState>)) => void,
  get: () => PosDisplayState,
): PosDisplayState {
  return {
    displayCompletedSurveyContext: null,
    setDisplayCompletedSurveyContext: (payload) => {
      const current = get().displayCompletedSurveyContext;
      if (deepEqual(current, payload)) return;
      set({ displayCompletedSurveyContext: payload });
    },

    activeDisplayOrder: null,
    setActiveDisplayOrder: (items) => {
      const current = get().activeDisplayOrder;
      if (deepEqual(current, items)) return;
      set({ activeDisplayOrder: items });
    },

    displayMetadata: {
      isPaymentMode: false,
      paymentMethod: null,
      isProcessing: false,
    },
    setDisplayMetadata: (metadata) => {
      const current = get().displayMetadata;
      const next = { ...current, ...metadata };
      if (deepEqual(current, next)) return;
      set({ displayMetadata: next });
    },

    displayOptionsModal: null,
    setDisplayOptionsModal: (payload) => {
      const current = get().displayOptionsModal;
      if (deepEqual(current, payload)) return;
      set({ displayOptionsModal: payload });
    },

    displayAllergenModal: null,
    setDisplayAllergenModal: (payload) => {
      const current = get().displayAllergenModal;
      if (deepEqual(current, payload)) return;
      set({ displayAllergenModal: payload });
    },

    displayRecommendedModal: null,
    setDisplayRecommendedModal: (payload) => {
      const current = get().displayRecommendedModal;
      if (deepEqual(current, payload)) return;
      set({ displayRecommendedModal: payload });
    },

    displaySurveyPrompt: null,
    setDisplaySurveyPrompt: (payload) => {
      const current = get().displaySurveyPrompt;
      if (deepEqual(current, payload)) return;
      set({ displaySurveyPrompt: payload });
    },

    displaySuccessSignal: null,
    setDisplaySuccessSignal: (type) => set({ displaySuccessSignal: type }),
  };
}
