"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Star } from "lucide-react"
import { useTranslations } from "next-intl"

import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { extractApiError } from "@/lib/operationalToast"
import type { DisplaySurveyPrompt } from "@/types/pos"

interface CustomerDisplaySurveyModalProps {
  prompt: DisplaySurveyPrompt
  terminalCode: string
  displayToken: string
  onCompleted: () => void
  onClosed: () => void
}

type AnswerMap = Record<
  string,
  {
    rating_value?: number
    boolean_value?: boolean
    selected_option_id?: string
    text_value?: string
  }
>

function isQuestionAnswered(
  question: DisplaySurveyPrompt["survey"]["questions"][number],
  answer: AnswerMap[string] | undefined
) {
  if (!question.is_required) {
    return true
  }
  if (!answer) {
    return false
  }
  if (question.answer_type === "RATING") {
    return answer.rating_value !== undefined
  }
  if (question.answer_type === "YES_NO") {
    return answer.boolean_value !== undefined
  }
  if (question.answer_type === "OPTION") {
    return Boolean(answer.selected_option_id)
  }
  return Boolean(answer.text_value?.trim())
}

export function CustomerDisplaySurveyModal({
  prompt,
  terminalCode,
  displayToken,
  onCompleted,
  onClosed,
}: CustomerDisplaySurveyModalProps) {
  const t = useTranslations("pos.displaySurvey")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [error, setError] = useState("")
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCompletedRef = useRef(onCompleted)

  useEffect(() => {
    onCompletedRef.current = onCompleted
  }, [onCompleted])

  const questions = prompt.survey.questions
  const currentQuestion = questions[currentIndex]
  const currentAnswer = answers[currentQuestion.id]
  const isLast = currentIndex === questions.length - 1
  const isCurrentAnswered = isQuestionAnswered(currentQuestion, currentAnswer)
  const progressPercent = ((currentIndex + 1) / Math.max(questions.length, 1)) * 100

  const answeredCount = useMemo(() => {
    return questions.reduce((count, question) => {
      return count + (isQuestionAnswered(question, answers[question.id]) ? 1 : 0)
    }, 0)
  }, [answers, questions])

  const setAnswer = (questionId: string, patch: AnswerMap[string]) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: {
        ...current[questionId],
        ...patch,
      },
    }))
    setError("")
  }

  const goNext = () => {
    if (!isQuestionAnswered(currentQuestion, currentAnswer)) {
      setError(t("validation.required"))
      return
    }
    setCurrentIndex((value) => Math.min(value + 1, questions.length - 1))
  }

  const submit = async () => {
    const missingRequired = questions.some((question) => !isQuestionAnswered(question, answers[question.id]))
    if (missingRequired) {
      setError(t("validation.completeRequired"))
      return
    }

    setIsSubmitting(true)
    setError("")
    try {
      await api.post("/guest-feedback/display/submit/", {
        terminal_code: terminalCode,
        display_token: displayToken,
        session_id: prompt.session_id,
        answers: questions.map((question) => ({
          question_id: question.id,
          ...(answers[question.id] ?? {}),
        })),
      })
      setIsCompleted(true)
    } catch (submitError) {
      setError(extractApiError(submitError, t("validation.submitFailed")))
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (!isCompleted) return
    completionTimerRef.current = setTimeout(() => {
      completionTimerRef.current = null
      onCompletedRef.current()
    }, 2000)
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current)
        completionTimerRef.current = null
      }
    }
  }, [isCompleted])

  const closeSurvey = async () => {
    setIsClosing(true)
    setError("")
    try {
      await api.post("/guest-feedback/display/close/", {
        terminal_code: terminalCode,
        display_token: displayToken,
        session_id: prompt.session_id,
      })
      onClosed()
    } catch (closeError) {
      setError(extractApiError(closeError, t("validation.closeFailed")))
    } finally {
      setIsClosing(false)
    }
  }

  const renderRating = () => {
    const values = Array.from(
      { length: currentQuestion.rating_max_value - currentQuestion.rating_min_value + 1 },
      (_, index) => currentQuestion.rating_min_value + index
    )
    const isFiveScale = currentQuestion.rating_min_value === 1 && currentQuestion.rating_max_value === 5

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {values.map((value) => {
          const selected = currentAnswer?.rating_value === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setAnswer(currentQuestion.id, { rating_value: value })}
              className={`rounded-2xl border px-4 py-5 text-center transition-all ${
 selected
 ? "border-cfd-accent bg-cfd-accent text-white shadow-lg shadow-cfd-accent/20"
 : "border-foreground/20 bg-foreground/10 text-foreground hover:border-cfd-accent/60 hover:bg-foreground/15"
 }`}
            >
              <div className="flex items-center justify-center gap-1">
                {isFiveScale ? (
                  Array.from({ length: value }).map((_, starIndex) => (
                    <Star key={starIndex} className="h-5 w-5 fill-current" />
                  ))
                ) : (
                  <span className="text-3xl font-bold">{value}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const renderYesNo = () => {
    const selected = currentAnswer?.boolean_value
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setAnswer(currentQuestion.id, { boolean_value: true })}
          className={`rounded-2xl border px-6 py-8 text-2xl font-bold transition-all ${
 selected === true
 ? "border-cfd-success bg-cfd-success text-white"
 : "border-foreground/20 bg-foreground/10 text-foreground"
 }`}
        >
          {t("yes")}
        </button>
        <button
          type="button"
          onClick={() => setAnswer(currentQuestion.id, { boolean_value: false })}
          className={`rounded-2xl border px-6 py-8 text-2xl font-bold transition-all ${
 selected === false
 ? "border-cfd-danger bg-cfd-danger text-white"
 : "border-foreground/20 bg-foreground/10 text-foreground"
 }`}
        >
          {t("no")}
        </button>
      </div>
    )
  }

  const renderOptions = () => {
    return (
      <div className="space-y-3">
        {currentQuestion.options.map((option) => {
          const selected = currentAnswer?.selected_option_id === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setAnswer(currentQuestion.id, { selected_option_id: option.id })}
              className={`flex w-full items-center justify-between rounded-2xl border px-5 py-5 text-left text-xl transition-all ${
 selected
 ? "border-cfd-accent bg-cfd-accent text-white"
 : "border-foreground/20 bg-foreground/10 text-foreground"
 }`}
            >
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderShortText = () => {
    return (
      <Textarea
        value={currentAnswer?.text_value ?? ""}
        onChange={(event) => setAnswer(currentQuestion.id, { text_value: event.target.value })}
        placeholder={currentQuestion.placeholder || t("textPlaceholder")}
        className="min-h-[160px] rounded-2xl border-foreground/20 bg-foreground/10 p-4 text-lg text-foreground placeholder:text-muted-foreground"
      />
    )
  }

  const renderQuestionBody = () => {
    if (currentQuestion.answer_type === "RATING") return renderRating()
    if (currentQuestion.answer_type === "YES_NO") return renderYesNo()
    if (currentQuestion.answer_type === "OPTION") return renderOptions()
    return renderShortText()
  }

  if (isCompleted) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-cfd-overlay/95 px-6 py-8">
        <div className="w-full max-w-2xl overflow-hidden rounded-5xl border border-cfd-success/30 bg-card shadow-2xl">
          <div className="border-b border-cfd-success/20 bg-cfd-success/10 px-10 py-8">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cfd-success text-white shadow-lg ring-4 ring-cfd-success/20">
                <CheckCircle2 className="h-9 w-9" strokeWidth={2.25} />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-foreground">{t("thankYouTitle")}</h2>
                <p className="mt-1 text-lg font-medium text-cfd-success">{t("thankYouSubtitle")}</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-10 py-10 text-center">
            <p className="text-2xl font-semibold text-foreground">{t("thankYouMessage")}</p>
            <p className="text-base">{t("thankYouClosing")}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-cfd-overlay/95 px-6 py-8">
      <div className="flex h-full w-full max-w-5xl flex-col rounded-5xl border border-foreground/10 bg-card/95 shadow-2xl">
        <div className="border-b border-foreground/10 px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-cfd-accent">
                {t("title")}
              </div>
              <h2 className="mt-2 text-3xl font-bold text-foreground">{prompt.survey.title}</h2>
              {prompt.survey.description ? (
                <p className="mt-2 max-w-3xl text-base">{prompt.survey.description}</p>
              ) : null}
            </div>
            <div className="text-right text-sm">
              <div>{t("progressLabel", { current: currentIndex + 1, total: questions.length })}</div>
              <div>{t("answeredLabel", { count: answeredCount, total: questions.length })}</div>
            </div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-cfd-accent transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center px-8 py-8">
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center">
            <div className="relative rounded-4xl border border-foreground/10 bg-foreground/5 p-8">
              {isSubmitting || isClosing ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-4xl bg-cfd-overlay/70">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cfd-accent" />
                    <div className="text-lg font-semibold text-foreground">
                      {isClosing ? t("closing") : t("submitting")}
                    </div>
                    <div className="text-sm">
                      {isClosing ? t("closingDescription") : t("submittingDescription")}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="mb-6 text-4xl font-bold leading-tight text-foreground">
                {currentQuestion.text}
              </div>
              <div className="min-h-[220px]">{renderQuestionBody()}</div>
            </div>

            {!error ? (
              <div className="mt-4 text-center text-sm">
                {isCurrentAnswered ? t("savedHint") : t("requiredHint")}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 text-center text-base font-medium text-cfd-danger">{error}</div>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-2xl border-foreground/15 bg-foreground/5 px-8 text-lg text-foreground hover:bg-foreground/10"
                  onClick={() => void closeSurvey()}
                  disabled={isSubmitting || isClosing}
                >
                  {t("close")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-2xl border-foreground/15 bg-foreground/5 px-8 text-lg text-foreground hover:bg-foreground/10"
                  onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                  disabled={currentIndex === 0 || isSubmitting || isClosing}
                >
                  {t("previous")}
                </Button>
              </div>

              {!isLast ? (
                <Button
                  type="button"
                  className="h-14 rounded-2xl bg-cfd-accent px-8 text-lg font-bold hover:bg-cfd-accent-muted"
                  onClick={goNext}
                  disabled={isSubmitting || isClosing}
                >
                  {t("next")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-14 rounded-2xl bg-cfd-success px-8 text-lg font-bold hover:bg-cfd-success/90"
                  onClick={() => void submit()}
                  disabled={isSubmitting || isClosing}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("submitting")}
                    </>
                  ) : (
                    t("finish")
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
