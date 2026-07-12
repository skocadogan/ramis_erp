import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Receipt,
  Send,
  X,
} from "lucide-react-native";
import { deriveCustomerOrderDisplayStatus } from "@/utils/customerOrderStatus";
import { useOrderStore } from "@/store/order-store";
import { useSurveyStore } from "@/store/survey-store";
import { useTableStore } from "@/store/table-store";
import { useTheme } from "@/hooks/useTheme";
import { useUIStore } from "@/store/ui-store";
import { useDialogStore } from "@/store/dialog-store";
import type {
  SmartTableSurveyAnswerPayload,
  SmartTableSurveyQuestion,
} from "@/types/survey";

const READY_DELAY_MS = 3.5 * 60 * 1000;
const TABLET_MIN_WIDTH = 768;

type DraftAnswer = {
  selectedOptionId?: string | null;
  ratingValue?: number | null;
  booleanValue?: boolean | null;
  textValue?: string;
};

function isQuestionAnswered(
  question: SmartTableSurveyQuestion,
  draft?: DraftAnswer,
): boolean {
  if (!draft) {
    return false;
  }

  switch (question.answer_type) {
    case "RATING":
      return typeof draft.ratingValue === "number";
    case "YES_NO":
      return typeof draft.booleanValue === "boolean";
    case "OPTION":
      return Boolean(draft.selectedOptionId);
    case "SHORT_TEXT":
      return Boolean((draft.textValue || "").trim());
    default:
      return false;
  }
}

function buildAnswerPayload(
  question: SmartTableSurveyQuestion,
  draft?: DraftAnswer,
): SmartTableSurveyAnswerPayload | null {
  if (!draft || !isQuestionAnswered(question, draft)) {
    return null;
  }

  return {
    question_id: question.id,
    selected_option_id: draft.selectedOptionId ?? null,
    rating_value: draft.ratingValue ?? null,
    boolean_value: draft.booleanValue ?? null,
    text_value: draft.textValue?.trim() || null,
  };
}

export function SmartTableSurveyHost() {
  const {
    stage,
    triggerReason,
    availableSurveys,
    availableSurveyCount,
    currentPrompt,
    isLoading,
    isSubmitting,
    openingSurveyId,
    readyPromptKey,
    handledReadyPromptKey,
    refreshAvailability,
    acceptConsent,
    openSurvey,
    dismissFlow,
    submitCurrentSurvey,
    resetSession,
  } = useSurveyStore();
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const selectedTable = useTableStore((s) => s.selectedTable);
  const language = useUIStore((s) => s.language);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors, primaryShadow } = useTheme();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, DraftAnswer>>(
    {},
  );

  const isTablet = width >= TABLET_MIN_WIDTH;
  const modalWidth = isTablet ? Math.min(width - 96, 920) : width - 24;
  const flowBusy = isLoading || isSubmitting;
  const questions = currentPrompt?.survey.questions ?? [];
  const activeQuestion = questions[questionIndex] ?? null;
  const ordersSignature = useMemo(
    () =>
      activeOrders
        .map((order) => `${order.id}:${order.status}:${order.updatedAt}`)
        .join("|"),
    [activeOrders],
  );

  const anchorOrderId = useMemo(() => {
    if (activeOrders.length === 0) {
      return null;
    }
    return (
      [...activeOrders].sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return left - right;
      })[0]?.id ?? null
    );
  }, [activeOrders]);

  const allOrdersReady = useMemo(() => {
    if (activeOrders.length === 0) {
      return false;
    }

    return activeOrders.every((order) => {
      const status = deriveCustomerOrderDisplayStatus(order);
      return (
        status === "PREPARED" ||
        status === "ON_THE_WAY" ||
        status === "DELIVERED"
      );
    });
  }, [activeOrders]);

  const [prevSessionId, setPrevSessionId] = useState(
    currentPrompt?.session_id ?? null,
  );
  if (currentPrompt && currentPrompt.session_id !== prevSessionId) {
    setPrevSessionId(currentPrompt.session_id);
    setQuestionIndex(0);
    setDraftAnswers({});
  }

  useEffect(() => {
    if (!selectedTable?.id || activeOrders.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      resetSession();
      return;
    }

    void refreshAvailability();
  }, [
    activeOrders.length,
    ordersSignature,
    refreshAvailability,
    resetSession,
    selectedTable?.id,
  ]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const readyKey =
      selectedTable?.id && anchorOrderId
        ? `${selectedTable.id}:${anchorOrderId}`
        : null;
    if (!readyKey || !allOrdersReady || availableSurveyCount === 0) {
      return;
    }
    if (handledReadyPromptKey === readyKey || readyPromptKey === readyKey) {
      return;
    }
    if (stage !== "idle") {
      return;
    }

    timerRef.current = setTimeout(() => {
      const state = useSurveyStore.getState();
      if (state.stage !== "idle" || state.handledReadyPromptKey === readyKey) {
        return;
      }
      void state.requestConsentFlow("READY", readyKey);
    }, READY_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    allOrdersReady,
    anchorOrderId,
    availableSurveyCount,
    handledReadyPromptKey,
    readyPromptKey,
    selectedTable?.id,
    stage,
  ]);

  const currentDraft = activeQuestion
    ? draftAnswers[activeQuestion.id]
    : undefined;
  const canContinue = activeQuestion
    ? !activeQuestion.is_required ||
      isQuestionAnswered(activeQuestion, currentDraft)
    : false;
  const progressLabel = questions.length
    ? `${questionIndex + 1} / ${questions.length}`
    : "0 / 0";

  const consentTitle =
    triggerReason === "BILL"
      ? language === "tr"
        ? "Hesabınızı istemeden önce kısa bir anket ister misiniz?"
        : "Would you like to answer a short survey before requesting the bill?"
      : language === "tr"
        ? "Siparişleriniz hazır. Kısa bir anket ister misiniz?"
        : "Your order is ready. Would you like to answer a short survey?";

  const consentDescription =
    triggerReason === "BILL"
      ? language === "tr"
        ? "Dilerseniz tek dokunuşla kısa bir geri bildirim bırakabilirsiniz."
        : "If you want, you can leave short feedback with a single tap."
      : language === "tr"
        ? "Deneyiminizi değerlendirmek sadece bir dakikanızı alır."
        : "Rating your experience only takes a minute.";

  const renderConsent = () => (
    <View
      className="rounded-[30px] border px-6 py-6"
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        width: modalWidth,
      }}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View
            className="mb-4 h-14 w-14 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                triggerReason === "BILL"
                  ? `${colors.warning}22`
                  : `${colors.primary}22`,
            }}
          >
            {triggerReason === "BILL" ? (
              <Receipt size={28} color={colors.warning} />
            ) : (
              <Bell size={28} color={colors.primary} />
            )}
          </View>
          <Text
            className="text-[24px] font-extrabold leading-8"
            style={{ color: colors.foreground }}
          >
            {consentTitle}
          </Text>
          <Text
            className="mt-3 text-[15px] leading-6"
            style={{ color: colors.mutedForeground }}
          >
            {consentDescription}
          </Text>
        </View>
        <Pressable
          onPress={() => void dismissFlow()}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.muted }}
        >
          <X size={20} color={colors.icon} />
        </Pressable>
      </View>

      <View className="mt-6 flex-row gap-3">
        <Pressable
          onPress={() => void dismissFlow()}
          disabled={flowBusy}
          className="h-14 flex-1 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.muted }}
        >
          <Text
            className="text-[15px] font-bold"
            style={{ color: colors.mutedForeground }}
          >
            {language === "tr" ? "Şimdi değil" : "Not now"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void acceptConsent()}
          disabled={flowBusy}
          className="h-14 flex-1 items-center justify-center rounded-2xl"
          style={{ backgroundColor: flowBusy ? colors.muted : colors.primary }}
        >
          <Text
            className="text-[15px] font-bold"
            style={{
              color: flowBusy
                ? colors.mutedForeground
                : colors.primaryForeground,
            }}
          >
            {language === "tr" ? "Anketi aç" : "Open survey"}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderPicker = () => (
    <View
      className="rounded-[30px] border px-6 py-6"
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        width: modalWidth,
      }}
    >
      <View className="mb-5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: `${colors.primary}22` }}
          >
            <ClipboardList size={24} color={colors.primary} />
          </View>
          <View>
            <Text
              className="text-[22px] font-extrabold"
              style={{ color: colors.foreground }}
            >
              {language === "tr" ? "Anket seçin" : "Choose a survey"}
            </Text>
            <Text
              className="text-[13px]"
              style={{ color: colors.mutedForeground }}
            >
              {language === "tr"
                ? `${availableSurveys.length} aktif anket hazır`
                : `${availableSurveys.length} active surveys available`}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => void dismissFlow()}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.muted }}
        >
          <X size={20} color={colors.icon} />
        </Pressable>
      </View>

      <ScrollView
        style={{ maxHeight: isTablet ? 420 : 360 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        <View className="gap-3">
          {availableSurveys.map((survey) => (
            <Pressable
              key={survey.id}
              onPress={() => void openSurvey(survey.id)}
              disabled={flowBusy}
              className="rounded-[24px] border px-5 py-5"
              style={{
                backgroundColor: colors.background,
                borderColor:
                  openingSurveyId === survey.id
                    ? colors.primary
                    : colors.border,
                opacity: flowBusy && openingSurveyId !== survey.id ? 0.7 : 1,
              }}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text
                    className="text-[18px] font-extrabold"
                    style={{ color: colors.foreground }}
                  >
                    {survey.title}
                  </Text>
                  {survey.description ? (
                    <Text
                      className="mt-2 text-[14px] leading-6"
                      style={{ color: colors.mutedForeground }}
                    >
                      {survey.description}
                    </Text>
                  ) : null}
                  <Text
                    className="mt-3 text-[12px] font-semibold"
                    style={{ color: colors.primary }}
                  >
                    {language === "tr"
                      ? `${survey.questions.length} soru`
                      : `${survey.questions.length} questions`}
                  </Text>
                </View>
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    backgroundColor:
                      openingSurveyId === survey.id
                        ? colors.primary
                        : `${colors.primary}18`,
                  }}
                >
                  {openingSurveyId === survey.id ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primaryForeground}
                    />
                  ) : (
                    <ChevronRight size={18} color={colors.primary} />
                  )}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderQuestionBody = (question: SmartTableSurveyQuestion) => {
    const draft = draftAnswers[question.id] ?? {};

    if (question.answer_type === "RATING") {
      const values = Array.from(
        { length: question.rating_max_value - question.rating_min_value + 1 },
        (_, index) => question.rating_min_value + index,
      );
      return (
        <View className="mt-5 flex-row flex-wrap gap-3">
          {values.map((value) => {
            const selected = draft.ratingValue === value;
            return (
              <Pressable
                key={value}
                onPress={() =>
                  setDraftAnswers((prev) => ({
                    ...prev,
                    [question.id]: { ...prev[question.id], ratingValue: value },
                  }))
                }
                className="h-14 min-w-[56px] items-center justify-center rounded-2xl border px-4"
                style={{
                  backgroundColor: selected
                    ? colors.primary
                    : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                }}
              >
                <Text
                  className="text-[16px] font-extrabold"
                  style={{
                    color: selected
                      ? colors.primaryForeground
                      : colors.foreground,
                  }}
                >
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    if (question.answer_type === "YES_NO") {
      const options = [
        { value: true, label: language === "tr" ? "Evet" : "Yes" },
        { value: false, label: language === "tr" ? "Hayır" : "No" },
      ];
      return (
        <View className="mt-5 flex-row gap-3">
          {options.map((option) => {
            const selected = draft.booleanValue === option.value;
            return (
              <Pressable
                key={option.label}
                onPress={() =>
                  setDraftAnswers((prev) => ({
                    ...prev,
                    [question.id]: {
                      ...prev[question.id],
                      booleanValue: option.value,
                    },
                  }))
                }
                className="h-16 flex-1 items-center justify-center rounded-2xl border"
                style={{
                  backgroundColor: selected
                    ? colors.primary
                    : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                }}
              >
                <Text
                  className="text-[16px] font-extrabold"
                  style={{
                    color: selected
                      ? colors.primaryForeground
                      : colors.foreground,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    if (question.answer_type === "OPTION") {
      return (
        <View className="mt-5 gap-3">
          {question.options.map((option) => {
            const selected = draft.selectedOptionId === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() =>
                  setDraftAnswers((prev) => ({
                    ...prev,
                    [question.id]: {
                      ...prev[question.id],
                      selectedOptionId: option.id,
                    },
                  }))
                }
                className="rounded-2xl border px-4 py-4"
                style={{
                  backgroundColor: selected
                    ? `${colors.primary}18`
                    : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                }}
              >
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: colors.foreground }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    return (
      <View
        className="mt-5 rounded-[24px] border px-4 py-4"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
        }}
      >
        <TextInput
          value={draft.textValue ?? ""}
          onChangeText={(text) =>
            setDraftAnswers((prev) => ({
              ...prev,
              [question.id]: { ...prev[question.id], textValue: text },
            }))
          }
          multiline
          numberOfLines={6}
          maxLength={280}
          textAlignVertical="top"
          placeholder={
            question.placeholder ||
            (language === "tr"
              ? "Görüşünüzü yazın..."
              : "Write your feedback...")
          }
          placeholderTextColor={colors.placeholder}
          style={{
            minHeight: 140,
            color: colors.foreground,
            fontSize: 16,
          }}
        />
      </View>
    );
  };

  const handlePrimaryAction = async () => {
    if (!activeQuestion) {
      return;
    }

    if (questionIndex < questions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
      return;
    }

    const payload = questions
      .map((question) =>
        buildAnswerPayload(question, draftAnswers[question.id]),
      )
      .filter(Boolean) as SmartTableSurveyAnswerPayload[];

    const missingRequiredQuestion = questions.find(
      (question) =>
        question.is_required &&
        !isQuestionAnswered(question, draftAnswers[question.id]),
    );
    if (missingRequiredQuestion) {
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Eksik cevap" : "Missing answer",
          language === "tr"
            ? "Lütfen zorunlu soruları tamamlayın."
            : "Please complete all required questions.",
        );
      return;
    }

    await submitCurrentSurvey(payload);
  };

  const renderSurvey = () => {
    if (!currentPrompt || !activeQuestion) {
      return null;
    }

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="rounded-[30px] border"
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          width: modalWidth,
          maxHeight: isTablet ? "88%" : "92%",
        }}
      >
        <View
          className="flex-row items-center justify-between border-b px-5 py-4"
          style={{ borderBottomColor: colors.border }}
        >
          <View className="flex-1 pr-4">
            <Text
              className="text-[12px] font-bold uppercase"
              style={{ color: colors.primary }}
            >
              {progressLabel}
            </Text>
            <Text
              className="mt-1 text-[22px] font-extrabold"
              style={{ color: colors.foreground }}
            >
              {currentPrompt.survey.title}
            </Text>
          </View>
          <Pressable
            onPress={() => void dismissFlow()}
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.muted }}
          >
            <X size={20} color={colors.icon} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 20,
            paddingBottom: 28,
          }}
        >
          <View
            className="rounded-[24px] px-4 py-4"
            style={{ backgroundColor: `${colors.primary}10` }}
          >
            <Text
              className="text-[12px] font-bold uppercase"
              style={{ color: colors.primary }}
            >
              {language === "tr" ? "Soru" : "Question"}
            </Text>
            <Text
              className="mt-2 text-[24px] font-extrabold leading-8"
              style={{ color: colors.foreground }}
            >
              {activeQuestion.text}
            </Text>
            {!activeQuestion.is_required ? (
              <Text
                className="mt-2 text-[13px]"
                style={{ color: colors.mutedForeground }}
              >
                {language === "tr"
                  ? "Bu soru isteğe bağlıdır."
                  : "This question is optional."}
              </Text>
            ) : null}
          </View>

          {renderQuestionBody(activeQuestion)}
        </ScrollView>

        <View
          className="flex-row items-center gap-3 border-t px-5 py-4"
          style={{
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <Pressable
            onPress={() => setQuestionIndex((prev) => Math.max(0, prev - 1))}
            disabled={questionIndex === 0 || isSubmitting}
            className="h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor:
                questionIndex === 0 ? colors.muted : colors.background,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft
              size={20}
              color={questionIndex === 0 ? colors.iconMuted : colors.foreground}
            />
          </Pressable>

          <Pressable
            onPress={() => void handlePrimaryAction()}
            disabled={!canContinue || isSubmitting}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl"
            style={{
              backgroundColor:
                canContinue && !isSubmitting ? colors.primary : colors.muted,
              ...primaryShadow,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator
                size="small"
                color={colors.primaryForeground}
              />
            ) : (
              <>
                {questionIndex === questions.length - 1 ? (
                  <Send
                    size={18}
                    color={canContinue ? colors.primaryForeground : colors.icon}
                  />
                ) : (
                  <ChevronRight
                    size={18}
                    color={canContinue ? colors.primaryForeground : colors.icon}
                  />
                )}
                <Text
                  className="text-[15px] font-extrabold"
                  style={{
                    color: canContinue
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  }}
                >
                  {questionIndex === questions.length - 1
                    ? language === "tr"
                      ? "Gönder"
                      : "Submit"
                    : language === "tr"
                      ? "Devam et"
                      : "Continue"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderSuccess = () => (
    <View
      className="items-center rounded-[30px] border px-6 py-8"
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        width: modalWidth,
      }}
    >
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: `${colors.success}20` }}
      >
        <CheckCircle2 size={42} color={colors.success} />
      </View>
      <Text
        className="mt-5 text-[26px] font-extrabold text-center"
        style={{ color: colors.foreground }}
      >
        {language === "tr" ? "Tesekkur ederiz" : "Thank you"}
      </Text>
      <Text
        className="mt-3 text-center text-[15px] leading-6"
        style={{ color: colors.mutedForeground }}
      >
        {language === "tr"
          ? "Geri bildiriminiz ekibimize iletildi."
          : "Your feedback has been delivered to our team."}
      </Text>
    </View>
  );

  if (stage === "idle") {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => void dismissFlow()}
    >
      <View
        className="flex-1 items-center justify-center px-3"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        {isLoading && stage !== "survey" ? (
          <View
            className="items-center rounded-[28px] border px-8 py-7"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              className="mt-4 text-[15px] font-semibold"
              style={{ color: colors.foreground }}
            >
              {language === "tr"
                ? "Anket hazirlaniyor..."
                : "Preparing survey..."}
            </Text>
          </View>
        ) : null}

        {!isLoading && stage === "consent" ? renderConsent() : null}
        {!isLoading && stage === "picker" ? renderPicker() : null}
        {!isLoading && stage === "survey" ? renderSurvey() : null}
        {!isLoading && stage === "success" ? renderSuccess() : null}
      </View>
    </Modal>
  );
}
