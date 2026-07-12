type SmartTableSurveyQuestionType =
  "RATING" | "YES_NO" | "OPTION" | "SHORT_TEXT";

interface SmartTableSurveyOption {
  id: string;
  label: string;
  sort_order: number;
}

export interface SmartTableSurveyQuestion {
  id: string;
  text: string;
  answer_type: SmartTableSurveyQuestionType;
  question_role: string;
  sort_order: number;
  is_required: boolean;
  placeholder: string;
  rating_min_value: number;
  rating_max_value: number;
  options: SmartTableSurveyOption[];
}

export interface SmartTableSurveyDefinition {
  id: string;
  title: string;
  description: string;
  questions: SmartTableSurveyQuestion[];
}

export interface SmartTableSurveyPrompt {
  session_id: string;
  survey: SmartTableSurveyDefinition;
  sale: string | null;
  order: string | null;
  table: string | null;
  source: string;
  session_key: string;
}

export interface SmartTableSurveyAnswerPayload {
  question_id: string;
  selected_option_id?: string | null;
  rating_value?: number | null;
  boolean_value?: boolean | null;
  text_value?: string | null;
}
