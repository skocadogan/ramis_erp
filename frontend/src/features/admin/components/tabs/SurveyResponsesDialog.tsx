"use client"

import { useEffect, useMemo, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Loader2, MessageSquareText } from "lucide-react"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { pageFromDrfNext } from "@/lib/pagination"
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import {
  adminApi,
  type SurveyAttentionStatus,
  type SurveyResponseRecord,
} from "../../services/adminApi"

interface SurveyResponsesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  surveyId: string | null
  surveyTitle?: string
}

const ATTENTION_STATUS_OPTIONS: SurveyAttentionStatus[] = ["OPEN", "REVIEWED", "RESOLVED"]

function getAttentionStatusLabel(
  t: ReturnType<typeof useTranslations>,
  status: "ALL" | SurveyAttentionStatus
) {
  if (status === "ALL") {
    return t("surveys.results.filters.allStatuses")
  }
  return t(`surveys.attentionStatus.${status}`)
}

export function SurveyResponsesDialog({
  open,
  onOpenChange,
  surveyId,
  surveyTitle,
}: SurveyResponsesDialogProps) {
  const t = useTranslations("admin")
  const queryClient = useQueryClient()
  const { canManage } = useModulePermissions()
  const canManageResponses = canManage("surveys.manage_response")

  const [statusFilter, setStatusFilter] = useState<"ALL" | SurveyAttentionStatus>("ALL")
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseRecord | null>(null)
  const [draftStatus, setDraftStatus] = useState<SurveyAttentionStatus>("OPEN")
  const [draftNote, setDraftNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const responsesQuery = useInfiniteQuery({
    queryKey: ["survey-responses", surveyId, statusFilter],
    queryFn: async ({ pageParam = 1 }) => {
      return adminApi.getSurveyResponses({
        page: pageParam,
        page_size: 50,
        survey_id: surveyId ?? undefined,
        attention_status: statusFilter === "ALL" ? undefined : statusFilter,
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: open && !!surveyId,
  })

  const responses = useMemo(
    () => responsesQuery.data?.pages.flatMap((page) => page.results ?? []) ?? [],
    [responsesQuery.data]
  )

  useEffect(() => {
    if (!selectedResponse && responses.length > 0) {
      setSelectedResponse(responses[0])
      return
    }
    if (selectedResponse) {
      const refreshed = responses.find((item) => item.id === selectedResponse.id)
      if (refreshed) setSelectedResponse(refreshed)
    }
  }, [responses, selectedResponse])

  useEffect(() => {
    if (!selectedResponse) return
    setDraftStatus(selectedResponse.attention_status)
    setDraftNote(selectedResponse.attention_note ?? "")
  }, [selectedResponse])

  const handleSaveAttention = async () => {
    if (!selectedResponse || !canManageResponses) return
    setIsSaving(true)
    try {
      await adminApi.updateSurveyResponseAttention(selectedResponse.id, {
        attention_status: draftStatus,
        attention_note: draftNote,
      })
      await queryClient.invalidateQueries({ queryKey: ["survey-responses", surveyId] })
      toastApiSuccess(t("surveys.results.messages.updateSuccess"))
    } catch (error) {
      toastApiError(error, t("surveys.results.messages.updateError"))
    } finally {
      setIsSaving(false)
    }
  }

  const formatMetrics = (response: SurveyResponseRecord) => {
    const chunks: string[] = []
    if (response.nps_score !== null && response.nps_score !== undefined) {
      chunks.push(`NPS ${response.nps_score}`)
    }
    if (response.food_rating !== null && response.food_rating !== undefined) {
      chunks.push(`${t("surveys.roles.FOOD")} ${response.food_rating}`)
    }
    if (response.service_rating !== null && response.service_rating !== undefined) {
      chunks.push(`${t("surveys.roles.SERVICE")} ${response.service_rating}`)
    }
    if (response.speed_rating !== null && response.speed_rating !== undefined) {
      chunks.push(`${t("surveys.roles.SPEED")} ${response.speed_rating}`)
    }
    if (response.cleanliness_rating !== null && response.cleanliness_rating !== undefined) {
      chunks.push(`${t("surveys.roles.CLEANLINESS")} ${response.cleanliness_rating}`)
    }
    return chunks.join(" | ") || "—"
  }

  const attentionBadgeClass = (status: SurveyAttentionStatus) => {
    if (status === "OPEN") return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
    if (status === "REVIEWED") return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="6xl" className="max-w-[96vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-blue-600" />
            {t("surveys.results.title")}
          </DialogTitle>
          <DialogDescription>
            {surveyTitle
              ? t("surveys.results.descriptionWithSurvey", { title: surveyTitle })
              : t("surveys.results.description")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                {t("surveys.results.count", { count: responses.length })}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as "ALL" | SurveyAttentionStatus)}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue>{getAttentionStatusLabel(t, statusFilter)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("surveys.results.filters.allStatuses")}</SelectItem>
                    {ATTENTION_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`surveys.attentionStatus.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid min-h-[540px] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
              <Card className="min-h-0 overflow-hidden border-border bg-white/95 dark:bg-slate-900/95">
                {responsesQuery.isLoading ? (
                  <div className="flex h-[540px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <VirtualTable
                    rows={responses}
                    rowHeight={78}
                    overscan={6}
                    fetchMore={() => void responsesQuery.fetchNextPage()}
                    hasMore={!!responsesQuery.hasNextPage}
                    isFetchingNextPage={responsesQuery.isFetchingNextPage}
                    className="h-[540px]"
                    header={
                      <thead className={virtualTableStickyHeadClass}>
                        <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-3">{t("surveys.results.table.date")}</th>
                          <th className="px-4 py-3">{t("surveys.results.table.context")}</th>
                          <th className="px-4 py-3">{t("surveys.results.table.metrics")}</th>
                          <th className="px-4 py-3">{t("surveys.results.table.status")}</th>
                        </tr>
                      </thead>
                    }
                    emptyState={
                      <div className="flex h-[540px] items-center justify-center text-sm text-muted-foreground">
                        {t("surveys.results.empty")}
                      </div>
                    }
                    loadingMore={
                      <tr>
                        <td colSpan={4} className="py-3 text-center">
                          <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                        </td>
                      </tr>
                    }
                    renderRow={(response) => {
                      const isActive = selectedResponse?.id === response.id
                      return (
                        <>
                          <td
                            className={`cursor-pointer px-4 py-3 ${isActive ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`}
                            onClick={() => setSelectedResponse(response)}
                          >
                            <div className="flex flex-col">
                              <span className="font-ui-semibold text-foreground">
                                {new Date(response.created_at).toLocaleString()}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {response.customer_name || t("surveys.results.noCustomer")}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`cursor-pointer px-4 py-3 text-sm ${isActive ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`}
                            onClick={() => setSelectedResponse(response)}
                          >
                            <div className="flex flex-col">
                              <span className="font-ui-medium text-foreground">
                                {response.branch_name}
                                {response.table_name ? ` / ${response.table_name}` : ""}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {response.staff_name || "—"}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`cursor-pointer px-4 py-3 text-sm text-muted-foreground ${isActive ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`}
                            onClick={() => setSelectedResponse(response)}
                          >
                            <div className="line-clamp-2">{formatMetrics(response)}</div>
                          </td>
                          <td
                            className={`cursor-pointer px-4 py-3 ${isActive ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`}
                            onClick={() => setSelectedResponse(response)}
                          >
                            <Badge variant="outline" className={attentionBadgeClass(response.attention_status)}>
                              {t(`surveys.attentionStatus.${response.attention_status}`)}
                            </Badge>
                          </td>
                        </>
                      )
                    }}
                  />
                )}
              </Card>

              <Card className="min-h-0 border-border bg-card">
                {!selectedResponse ? (
                  <div className="flex h-[540px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                    {t("surveys.results.detailEmpty")}
                  </div>
                ) : (
                  <div className="flex h-[540px] flex-col">
                    <div className="border-b border-border px-4 py-3">
                      <div className="text-sm font-ui-semibold text-foreground">
                        {selectedResponse.customer_name || t("surveys.results.noCustomer")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {selectedResponse.branch_name}
                        {selectedResponse.table_name ? ` / ${selectedResponse.table_name}` : ""}
                      </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                      <div className="space-y-2">
                        <div className="text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
                          {t("surveys.results.detailAnswers")}
                        </div>
                        <div className="space-y-2">
                          {selectedResponse.answers.map((answer) => (
                            <div key={answer.id} className="rounded-lg border border-border bg-slate-50/70 p-3 dark:bg-slate-900/40">
                              <div className="text-sm font-ui-medium text-foreground">{answer.question_text}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {String(answer.answer_value ?? "—")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
                          {t("surveys.results.detailPreview")}
                        </div>
                        <p className="rounded-lg border border-border bg-slate-50/70 p-3 text-sm text-muted-foreground dark:bg-slate-900/40">
                          {selectedResponse.answers_preview || "—"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
                          {t("surveys.results.detailAttention")}
                        </div>
                        <Select
                          value={draftStatus}
                          onValueChange={(value) => setDraftStatus(value as SurveyAttentionStatus)}
                          disabled={!canManageResponses}
                        >
                          <SelectTrigger>
                            <SelectValue>{getAttentionStatusLabel(t, draftStatus)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ATTENTION_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>
                                {t(`surveys.attentionStatus.${status}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Textarea
                          value={draftNote}
                          onChange={(event) => setDraftNote(event.target.value)}
                          placeholder={t("surveys.results.notePlaceholder")}
                          disabled={!canManageResponses}
                          className="min-h-[120px]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          {canManageResponses && selectedResponse ? (
            <Button onClick={() => void handleSaveAttention()} loading={isSaving}>
              {t("surveys.results.saveAttention")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
