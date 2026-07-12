import { api } from "@/services/api";
import type {
  SmartTableSurveyAnswerPayload,
  SmartTableSurveyDefinition,
  SmartTableSurveyPrompt,
} from "@/types/survey";

interface SmartTableSurveyListResponse {
  surveys: SmartTableSurveyDefinition[];
  order_id: string;
  has_answered_survey: boolean;
}

export interface SmartTableSurveyAvailability {
  surveys: SmartTableSurveyDefinition[];
  hasAnsweredSurvey: boolean;
}

interface SmartTableSurveyOpenResponse {
  status: string;
  prompt: SmartTableSurveyPrompt;
}

interface SmartTableSurveySubmitResponse {
  status: string;
  response_id: string;
  needs_attention: boolean;
}

export async function fetchSmartTableSurveyAvailability(
  tableId: string,
  orderId: string,
): Promise<SmartTableSurveyAvailability> {
  const response = await api.get<SmartTableSurveyListResponse>(
    "/guest-feedback/smart-table/available/",
    { table_id: tableId, order_id: orderId },
  );
  if (response.error || !response.data) {
    throw new Error(response.error || "Anketler yüklenemedi");
  }
  return {
    surveys: response.data.surveys || [],
    hasAnsweredSurvey: Boolean(response.data.has_answered_survey),
  };
}

export async function openSmartTableSurveySession(input: {
  tableId: string;
  orderId: string;
  surveyId: string;
}): Promise<SmartTableSurveyPrompt> {
  const response = await api.post<SmartTableSurveyOpenResponse>(
    "/guest-feedback/smart-table/open/",
    {
      table_id: input.tableId,
      order_id: input.orderId,
      survey_id: input.surveyId,
    },
  );
  if (response.error || !response.data?.prompt) {
    throw new Error(response.error || "Anket açılamadı");
  }
  return response.data.prompt;
}

export async function submitSmartTableSurveySession(
  sessionId: string,
  answers: SmartTableSurveyAnswerPayload[],
): Promise<SmartTableSurveySubmitResponse> {
  const response = await api.post<SmartTableSurveySubmitResponse>(
    "/guest-feedback/smart-table/submit/",
    {
      session_id: sessionId,
      answers,
    },
  );
  if (response.error || !response.data) {
    throw new Error(response.error || "Anket gönderilemedi");
  }
  return response.data;
}

export async function closeSmartTableSurveySession(
  sessionId: string,
): Promise<void> {
  const response = await api.post<{ status: string }>(
    "/guest-feedback/smart-table/close/",
    { session_id: sessionId },
  );
  if (response.error) {
    throw new Error(response.error || "Anket kapatılamadı");
  }
}
