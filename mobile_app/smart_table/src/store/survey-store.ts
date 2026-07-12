import { create } from "zustand";
import { useDialogStore } from "@/store/dialog-store";
import { useOrderStore } from "@/store/order-store";
import { useTableStore } from "@/store/table-store";
import { useUIStore } from "@/store/ui-store";
import {
  closeSmartTableSurveySession,
  fetchSmartTableSurveyAvailability,
  openSmartTableSurveySession,
  submitSmartTableSurveySession,
} from "@/services/surveyService";
import type {
  SmartTableSurveyAnswerPayload,
  SmartTableSurveyDefinition,
  SmartTableSurveyPrompt,
} from "@/types/survey";

type SurveyTriggerReason = "MANUAL" | "BILL" | "READY";
type SurveyStage = "idle" | "consent" | "picker" | "survey" | "success";

const SUCCESS_DISMISS_MS = 1800;

function resolveSurveyContext(): { tableId: string; orderId: string } | null {
  const tableId = useTableStore.getState().selectedTable?.id;
  const activeOrders = useOrderStore.getState().activeOrders;
  if (!tableId || activeOrders.length === 0) {
    return null;
  }

  const anchorOrder = [...activeOrders].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return left - right;
  })[0];

  if (!anchorOrder) {
    return null;
  }

  return {
    tableId,
    orderId: anchorOrder.id,
  };
}

function showSurveyAlert(
  titleTr: string,
  titleEn: string,
  messageTr: string,
  messageEn: string,
) {
  const language = useUIStore.getState().language;
  useDialogStore
    .getState()
    .alert(
      language === "tr" ? titleTr : titleEn,
      language === "tr" ? messageTr : messageEn,
    );
}

function mapSurveyErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Anket servisine ulaşılamadı.";
  }

  if (error.message.includes("JSON Parse error")) {
    return "Anket servisi geçerli bir yanıt döndürmedi. Backend tarafını kontrol edin.";
  }

  return error.message || "Anket servisine ulaşılamadı.";
}

interface SurveyState {
  stage: SurveyStage;
  triggerReason: SurveyTriggerReason | null;
  availableSurveyCount: number;
  availableSurveys: SmartTableSurveyDefinition[];
  currentPrompt: SmartTableSurveyPrompt | null;
  isLoading: boolean;
  isSubmitting: boolean;
  openingSurveyId: string | null;
  readyPromptKey: string | null;
  handledReadyPromptKey: string | null;

  refreshAvailability: () => Promise<number>;
  requestManualOpen: () => Promise<void>;
  requestConsentFlow: (
    reason: Exclude<SurveyTriggerReason, "MANUAL">,
    readyPromptKey?: string | null,
  ) => Promise<boolean>;
  acceptConsent: () => Promise<void>;
  openSurvey: (surveyId: string) => Promise<void>;
  dismissFlow: () => Promise<void>;
  submitCurrentSurvey: (
    answers: SmartTableSurveyAnswerPayload[],
  ) => Promise<boolean>;
  resetSession: () => void;
}

export const useSurveyStore = create<SurveyState>((set, get) => ({
  stage: "idle",
  triggerReason: null,
  availableSurveyCount: 0,
  availableSurveys: [],
  currentPrompt: null,
  isLoading: false,
  isSubmitting: false,
  openingSurveyId: null,
  readyPromptKey: null,
  handledReadyPromptKey: null,

  refreshAvailability: async () => {
    const context = resolveSurveyContext();
    if (!context) {
      set({
        availableSurveyCount: 0,
        availableSurveys: [],
      });
      return 0;
    }

    try {
      const availability = await fetchSmartTableSurveyAvailability(
        context.tableId,
        context.orderId,
      );
      const surveys = availability.surveys;
      set({
        availableSurveys: surveys,
        availableSurveyCount: surveys.length,
      });
      return surveys.length;
    } catch (error) {
      console.warn("[SurveyStore] availability error:", error);
      set({
        availableSurveyCount: 0,
        availableSurveys: [],
      });
      return 0;
    }
  },

  requestManualOpen: async () => {
    if (get().stage !== "idle" || get().isLoading || get().isSubmitting) {
      return;
    }

    const context = resolveSurveyContext();
    if (!context) {
      showSurveyAlert(
        "Anket kullanılamıyor",
        "Survey unavailable",
        "Anket açmak için aktif siparişiniz olmalı.",
        "You need an active order to open a survey.",
      );
      return;
    }

    set({ isLoading: true });
    try {
      const availability = await fetchSmartTableSurveyAvailability(
        context.tableId,
        context.orderId,
      );
      const surveys = availability.surveys;
      set({
        availableSurveys: surveys,
        availableSurveyCount: surveys.length,
        triggerReason: "MANUAL",
      });

      if (surveys.length === 0) {
        showSurveyAlert(
          availability.hasAnsweredSurvey
            ? "Anketi cevapladınız"
            : "Aktif anket yok",
          availability.hasAnsweredSurvey
            ? "Survey completed"
            : "No active survey",
          availability.hasAnsweredSurvey
            ? "Anketi cevapladınız. Cevaplarınız ekibimize iletilmiştir."
            : "Bu masa oturumu için gösterilebilecek aktif bir anket bulunmuyor.",
          availability.hasAnsweredSurvey
            ? "You already completed the survey. Your responses have been shared with our team."
            : "There is no active survey available for this table session.",
        );
        set({
          stage: "idle",
          triggerReason: null,
        });
        return;
      }

      if (surveys.length === 1) {
        set({ isLoading: false });
        await get().openSurvey(surveys[0].id);
        return;
      }

      set({ stage: "picker" });
    } catch (error) {
      showSurveyAlert(
        "Anket yüklenemedi",
        "Survey unavailable",
        mapSurveyErrorMessage(error),
        mapSurveyErrorMessage(error),
      );
      set({
        stage: "idle",
        triggerReason: null,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  requestConsentFlow: async (reason, readyPromptKey = null) => {
    if (get().stage !== "idle" || get().isLoading || get().isSubmitting) {
      return false;
    }

    const context = resolveSurveyContext();
    if (!context) {
      return false;
    }

    set({ isLoading: true });
    try {
      const availability = await fetchSmartTableSurveyAvailability(
        context.tableId,
        context.orderId,
      );
      const surveys = availability.surveys;
      if (surveys.length === 0) {
        set({
          availableSurveyCount: 0,
          availableSurveys: [],
          triggerReason: null,
          stage: "idle",
          readyPromptKey: null,
        });
        return false;
      }

      set({
        availableSurveys: surveys,
        availableSurveyCount: surveys.length,
        triggerReason: reason,
        stage: "consent",
        readyPromptKey: readyPromptKey ?? null,
      });
      return true;
    } catch (error) {
      console.warn("[SurveyStore] consent availability error:", error);
      set({
        availableSurveyCount: 0,
        availableSurveys: [],
        triggerReason: null,
        stage: "idle",
        readyPromptKey: null,
      });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  acceptConsent: async () => {
    if (get().isLoading || get().isSubmitting) {
      return;
    }

    const surveys = get().availableSurveys;
    if (surveys.length === 0) {
      set({ stage: "idle", triggerReason: null });
      return;
    }

    if (get().triggerReason === "READY" && get().readyPromptKey) {
      set({ handledReadyPromptKey: get().readyPromptKey });
    }

    if (surveys.length === 1) {
      await get().openSurvey(surveys[0].id);
      return;
    }

    set({ stage: "picker" });
  },

  openSurvey: async (surveyId) => {
    if (get().isLoading || get().isSubmitting) {
      return;
    }

    const context = resolveSurveyContext();
    if (!context) {
      showSurveyAlert(
        "Anket kullanılamıyor",
        "Survey unavailable",
        "Aktif sipariş bağlamı çözülemedi.",
        "The active order context could not be resolved.",
      );
      return;
    }

    set({ isLoading: true, openingSurveyId: surveyId });
    try {
      const prompt = await openSmartTableSurveySession({
        tableId: context.tableId,
        orderId: context.orderId,
        surveyId,
      });
      set({
        currentPrompt: prompt,
        stage: "survey",
      });
    } catch (error) {
      showSurveyAlert(
        "Anket açılamadı",
        "Survey could not open",
        error instanceof Error ? error.message : "Anket açılamadı.",
        error instanceof Error
          ? error.message
          : "The survey could not be opened.",
      );
      set({ stage: "idle", triggerReason: null });
    } finally {
      set({ isLoading: false, openingSurveyId: null });
    }
  },

  dismissFlow: async () => {
    const prompt = get().currentPrompt;
    if (prompt) {
      try {
        await closeSmartTableSurveySession(prompt.session_id);
      } catch (error) {
        console.warn("[SurveyStore] close error:", error);
      }
    }

    const handledReadyPromptKey =
      get().triggerReason === "READY" && get().readyPromptKey
        ? get().readyPromptKey
        : get().handledReadyPromptKey;

    set({
      stage: "idle",
      triggerReason: null,
      currentPrompt: null,
      readyPromptKey: null,
      handledReadyPromptKey,
      isLoading: false,
      isSubmitting: false,
      openingSurveyId: null,
    });
  },

  submitCurrentSurvey: async (answers) => {
    const prompt = get().currentPrompt;
    if (!prompt) {
      return false;
    }

    set({ isSubmitting: true });
    try {
      await submitSmartTableSurveySession(prompt.session_id, answers);
      const nextSurveys = get().availableSurveys.filter(
        (item) => item.id !== prompt.survey.id,
      );
      const nextHandledReadyPromptKey =
        get().triggerReason === "READY" && get().readyPromptKey
          ? get().readyPromptKey
          : get().handledReadyPromptKey;

      set({
        availableSurveys: nextSurveys,
        availableSurveyCount: Math.max(0, get().availableSurveyCount - 1),
        currentPrompt: null,
        stage: "success",
        handledReadyPromptKey: nextHandledReadyPromptKey,
        readyPromptKey: null,
      });

      setTimeout(() => {
        const currentStage = useSurveyStore.getState().stage;
        if (currentStage !== "success") {
          return;
        }
        useSurveyStore.setState({
          stage: "idle",
          triggerReason: null,
          isSubmitting: false,
        });
      }, SUCCESS_DISMISS_MS);

      void get().refreshAvailability();
      return true;
    } catch (error) {
      showSurveyAlert(
        "Anket gönderilemedi",
        "Survey could not be sent",
        error instanceof Error ? error.message : "Anket gönderilemedi.",
        error instanceof Error
          ? error.message
          : "The survey could not be sent.",
      );
      return false;
    } finally {
      set({ isSubmitting: false });
    }
  },

  resetSession: () => {
    set({
      stage: "idle",
      triggerReason: null,
      availableSurveyCount: 0,
      availableSurveys: [],
      currentPrompt: null,
      isLoading: false,
      isSubmitting: false,
      openingSurveyId: null,
      readyPromptKey: null,
      handledReadyPromptKey: null,
    });
  },
}));
