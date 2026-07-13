"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import {
  ClipboardList,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast"
import type { Branch } from "@/types/user.types"
import {
  adminApi,
  type Survey,
  type SurveyForm,
  type SurveyQuestionForm,
  type SurveyQuestionOptionForm,
  type SurveyQuestionRole,
  type SurveyQuestionType,
} from "../../services/adminApi"
import { SurveyResponsesDialog } from "./SurveyResponsesDialog"

interface SurveyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branches: Branch[]
  initialSurvey: Survey | null
  isSaving: boolean
  onSave: (form: SurveyForm) => Promise<void>
}

const QUESTION_TYPE_OPTIONS: SurveyQuestionType[] = [
  "RATING",
  "YES_NO",
  "OPTION",
  "SHORT_TEXT",
]

const QUESTION_ROLE_OPTIONS: SurveyQuestionRole[] = [
  "NONE",
  "NPS",
  "FOOD",
  "SERVICE",
  "SPEED",
  "CLEANLINESS",
]

function getQuestionTypeLabel(t: ReturnType<typeof useTranslations>, type: SurveyQuestionType) {
  return t(`surveys.answerTypes.${type}`)
}

function getQuestionRoleLabel(t: ReturnType<typeof useTranslations>, role: SurveyQuestionRole) {
  return t(`surveys.roles.${role}`)
}

function createEmptyOption(sortOrder: number): SurveyQuestionOptionForm {
  return {
    label: "",
    sort_order: sortOrder,
    is_active: true,
  }
}

function createEmptyQuestion(sortOrder: number): SurveyQuestionForm {
  return {
    text: "",
    answer_type: "RATING",
    question_role: "NONE",
    sort_order: sortOrder,
    is_required: true,
    placeholder: "",
    rating_min_value: 1,
    rating_max_value: 5,
    is_active: true,
    options: [],
  }
}

function getQuestionItemKey(question: SurveyQuestionForm, questionIndex: number) {
  return question.id ?? `new-question-${questionIndex}`
}

function getOptionItemKey(
  question: SurveyQuestionForm,
  questionIndex: number,
  option: SurveyQuestionOptionForm,
  optionIndex: number
) {
  return option.id ?? `${getQuestionItemKey(question, questionIndex)}-option-${optionIndex}`
}

function mapSurveyToForm(survey: Survey | null): SurveyForm {
  if (!survey) {
    return {
      title: "",
      description: "",
      sort_order: 0,
      is_active: true,
      is_customer_display_active: true,
      is_smart_table_active: false,
      branches: [],
      questions: [createEmptyQuestion(0)],
    }
  }

  return {
    title: survey.title,
    description: survey.description,
    sort_order: survey.sort_order,
    is_active: survey.is_active,
    is_customer_display_active: survey.is_customer_display_active,
    is_smart_table_active: survey.is_smart_table_active,
    branches: [...survey.branches],
    questions: survey.questions.map((question, index) => ({
      id: question.id,
      text: question.text,
      answer_type: question.answer_type,
      question_role: question.question_role,
      sort_order: question.sort_order ?? index,
      is_required: question.is_required,
      placeholder: question.placeholder,
      rating_min_value: question.rating_min_value,
      rating_max_value: question.rating_max_value,
      is_active: question.is_active ?? true,
      options: question.options.map((option, optionIndex) => ({
        id: option.id,
        label: option.label,
        sort_order: option.sort_order ?? optionIndex,
        is_active: option.is_active ?? true,
      })),
    })),
  }
}

function SurveyFormDialog({
  open,
  onOpenChange,
  branches,
  initialSurvey,
  isSaving,
  onSave,
}: SurveyFormDialogProps) {
  const t = useTranslations("admin")
  const [form, setForm] = useState<SurveyForm>(mapSurveyToForm(initialSurvey))

  useEffect(() => {
    if (open) {
      setForm(mapSurveyToForm(initialSurvey))
    }
  }, [open, initialSurvey])

  const updateQuestion = (index: number, patch: Partial<SurveyQuestionForm>) => {
    setForm((current) => {
      const nextQuestions = [...current.questions]
      nextQuestions[index] = { ...nextQuestions[index], ...patch }
      return { ...current, questions: nextQuestions }
    })
  }

  const updateOption = (questionIndex: number, optionIndex: number, patch: Partial<SurveyQuestionOptionForm>) => {
    setForm((current) => {
      const nextQuestions = [...current.questions]
      const question = { ...nextQuestions[questionIndex] }
      const nextOptions = [...question.options]
      nextOptions[optionIndex] = { ...nextOptions[optionIndex], ...patch }
      question.options = nextOptions
      nextQuestions[questionIndex] = question
      return { ...current, questions: nextQuestions }
    })
  }

  const toggleBranch = (branchId: string, checked: boolean) => {
    setForm((current) => {
      const branchSet = new Set(current.branches)
      if (checked) {
        branchSet.add(branchId)
      } else {
        branchSet.delete(branchId)
      }
      return { ...current, branches: Array.from(branchSet) }
    })
  }

  const addQuestion = () => {
    setForm((current) => ({
      ...current,
      questions: [...current.questions, createEmptyQuestion(current.questions.length)],
    }))
  }

  const removeQuestion = (index: number) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const addOption = (questionIndex: number) => {
    setForm((current) => {
      const nextQuestions = [...current.questions]
      const question = { ...nextQuestions[questionIndex] }
      question.options = [...question.options, createEmptyOption(question.options.length)]
      nextQuestions[questionIndex] = question
      return { ...current, questions: nextQuestions }
    })
  }

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setForm((current) => {
      const nextQuestions = [...current.questions]
      const question = { ...nextQuestions[questionIndex] }
      question.options = question.options.filter((_, idx) => idx !== optionIndex)
      nextQuestions[questionIndex] = question
      return { ...current, questions: nextQuestions }
    })
  }

  const handleQuestionTypeChange = (index: number, answerType: SurveyQuestionType) => {
    const patch: Partial<SurveyQuestionForm> = { answer_type: answerType }
    if (answerType === "OPTION" && form.questions[index].options.length === 0) {
      patch.options = [createEmptyOption(0)]
    }
    if (answerType !== "OPTION") {
      patch.options = []
    }
    updateQuestion(index, patch)
  }

  const handleRoleChange = (index: number, role: SurveyQuestionRole) => {
    if (role === "NPS") {
      updateQuestion(index, {
        question_role: role,
        answer_type: "RATING",
        rating_min_value: 0,
        rating_max_value: 10,
      })
      return
    }
    updateQuestion(index, { question_role: role })
  }

  const submit = async () => {
    const cleanedForm: SurveyForm = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      questions: form.questions.map((question, questionIndex) => ({
        ...question,
        text: question.text.trim(),
        placeholder: question.placeholder.trim(),
        sort_order: question.sort_order ?? questionIndex,
        options: question.options.map((option, optionIndex) => ({
          ...option,
          label: option.label.trim(),
          sort_order: option.sort_order ?? optionIndex,
        })),
      })),
    }
    await onSave(cleanedForm)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="6xl" className="max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>
            {initialSurvey ? t("surveys.form.editTitle") : t("surveys.form.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("surveys.form.description")}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("surveys.form.title")}</label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t("surveys.form.titlePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("surveys.form.sortOrder")}</label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value || 0) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("surveys.form.descriptionLabel")}</label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder={t("surveys.form.descriptionPlaceholder")}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-medium">{t("surveys.form.flags.active")}</span>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-medium">{t("surveys.form.flags.customerDisplay")}</span>
                <Switch
                  checked={form.is_customer_display_active}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, is_customer_display_active: checked }))}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm font-medium">{t("surveys.form.flags.smartTable")}</span>
                <Switch
                  checked={form.is_smart_table_active}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, is_smart_table_active: checked }))}
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-foreground">{t("surveys.form.branches")}</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Checkbox
                      checked={form.branches.includes(branch.id)}
                      onCheckedChange={(checked) => toggleBranch(branch.id, Boolean(checked))}
                    />
                    <span className="text-sm text-foreground">{branch.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">{t("surveys.form.questions")}</div>
                <Button type="button" variant="outline" onClick={addQuestion} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("surveys.form.addQuestion")}
                </Button>
              </div>

              {form.questions.map((question, questionIndex) => (
                <Card key={getQuestionItemKey(question, questionIndex)} className="border-border">
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">
                        {t("surveys.form.questionNumber", { number: questionIndex + 1 })}
                      </div>
                      {form.questions.length > 1 ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(questionIndex)}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-foreground">{t("surveys.form.questionText")}</label>
                        <Input
                          value={question.text}
                          onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })}
                          placeholder={t("surveys.form.questionTextPlaceholder")}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">{t("surveys.form.answerType")}</label>
                        <Select
                          value={question.answer_type}
                          onValueChange={(value) => handleQuestionTypeChange(questionIndex, value as SurveyQuestionType)}
                        >
                          <SelectTrigger>
                            <SelectValue>{getQuestionTypeLabel(t, question.answer_type)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPE_OPTIONS.map((type) => (
                              <SelectItem key={type} value={type}>
                                {getQuestionTypeLabel(t, type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">{t("surveys.form.role")}</label>
                        <Select
                          value={question.question_role}
                          onValueChange={(value) => handleRoleChange(questionIndex, value as SurveyQuestionRole)}
                        >
                          <SelectTrigger>
                            <SelectValue>{getQuestionRoleLabel(t, question.question_role)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {QUESTION_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>
                                {getQuestionRoleLabel(t, role)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">{t("surveys.form.questionSortOrder")}</label>
                        <Input
                          type="number"
                          value={question.sort_order}
                          onChange={(event) => updateQuestion(questionIndex, { sort_order: Number(event.target.value || 0) })}
                        />
                      </div>

                      <label className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm font-medium">{t("surveys.form.required")}</span>
                        <Switch
                          checked={question.is_required}
                          onCheckedChange={(checked) => updateQuestion(questionIndex, { is_required: checked })}
                        />
                      </label>

                      {question.answer_type === "RATING" ? (
                        <>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t("surveys.form.ratingMin")}</label>
                            <Input
                              type="number"
                              value={question.rating_min_value}
                              onChange={(event) => updateQuestion(questionIndex, { rating_min_value: Number(event.target.value || 0) })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t("surveys.form.ratingMax")}</label>
                            <Input
                              type="number"
                              value={question.rating_max_value}
                              onChange={(event) => updateQuestion(questionIndex, { rating_max_value: Number(event.target.value || 0) })}
                            />
                          </div>
                        </>
                      ) : null}

                      {question.answer_type === "SHORT_TEXT" ? (
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-foreground">{t("surveys.form.placeholder")}</label>
                          <Input
                            value={question.placeholder}
                            onChange={(event) => updateQuestion(questionIndex, { placeholder: event.target.value })}
                            placeholder={t("surveys.form.placeholderPlaceholder")}
                          />
                        </div>
                      ) : null}
                    </div>

                    {question.answer_type === "OPTION" ? (
                      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-foreground">{t("surveys.form.options")}</div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => addOption(questionIndex)}>
                            <Plus className="mr-1 h-4 w-4" />
                            {t("surveys.form.addOption")}
                          </Button>
                        </div>
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={getOptionItemKey(question, questionIndex, option, optionIndex)}
                            className="grid gap-3 md:grid-cols-[1fr_120px_auto]"
                          >
                            <Input
                              value={option.label}
                              onChange={(event) => updateOption(questionIndex, optionIndex, { label: event.target.value })}
                              placeholder={t("surveys.form.optionPlaceholder")}
                            />
                            <Input
                              type="number"
                              value={option.sort_order}
                              onChange={(event) => updateOption(questionIndex, optionIndex, { sort_order: Number(event.target.value || 0) })}
                            />
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(questionIndex, optionIndex)}>
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => void submit()} loading={isSaving}>
            {initialSurvey ? t("common.update") : t("common.create")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SurveysTab() {
  const t = useTranslations("admin")
  const queryClient = useQueryClient()
  const { canManage } = useModulePermissions()

  const canManageSurvey = canManage("surveys.manage_survey")
  const canViewResponses =
    canManage("surveys.view_response") || canManage("surveys.manage_response")

  const [searchTerm, setSearchTerm] = useState("")
  const [branchFilter, setBranchFilter] = useState("")
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [surveyToDelete, setSurveyToDelete] = useState<Survey | null>(null)
  const [resultsSurvey, setResultsSurvey] = useState<Survey | null>(null)

  const surveysQuery = useQuery({
    queryKey: ["admin-surveys", searchTerm, branchFilter],
    queryFn: async () => {
      return adminApi.getSurveys({
        page_size: 200,
        search: searchTerm || undefined,
        branch_id: branchFilter || undefined,
      })
    },
  })

  const branchesQuery = useQuery({
    queryKey: ["admin-survey-branches"],
    queryFn: () => adminApi.getBranches({ page_size: 200 }),
  })

  const surveys = useMemo(() => surveysQuery.data?.results ?? [], [surveysQuery.data?.results])
  const branches = branchesQuery.data ?? []

  const filteredSurveys = useMemo(() => {
    if (!searchTerm.trim()) return surveys
    const lowered = searchTerm.toLowerCase()
    return surveys.filter((survey) => {
      return (
        survey.title.toLowerCase().includes(lowered) ||
        survey.description.toLowerCase().includes(lowered)
      )
    })
  }, [searchTerm, surveys])

  const refreshSurveys = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-surveys"] })
  }

  const handleSaveSurvey = async (form: SurveyForm) => {
    setIsSaving(true)
    try {
      if (editingSurvey) {
        await adminApi.updateSurvey(editingSurvey.id, form)
        toastApiSuccess(t("surveys.messages.updateSuccess"))
      } else {
        await adminApi.createSurvey(form)
        toastApiSuccess(t("surveys.messages.createSuccess"))
      }
      setIsFormOpen(false)
      setEditingSurvey(null)
      await refreshSurveys()
    } catch (error) {
      toastApiError(error, t("surveys.messages.saveError"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSurvey = async () => {
    if (!surveyToDelete) return
    try {
      await adminApi.deleteSurvey(surveyToDelete.id)
      toastApiSuccess(t("surveys.messages.deleteSuccess"))
      setSurveyToDelete(null)
      await refreshSurveys()
    } catch (error) {
      toastApiError(error, t("surveys.messages.deleteError"))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold dark:text-white">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            {t("surveys.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("surveys.description")}</p>
        </div>
        {canManageSurvey ? (
          <Button
            onClick={() => {
              setEditingSurvey(null)
              setIsFormOpen(true)
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("surveys.addNew")}
          </Button>
        ) : null}
      </div>

      <Card className="border-border bg-white/95 p-4 bg-card/95">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("surveys.searchPlaceholder")}
            className="md:flex-1"
          />
          <Select
            value={branchFilter || "ALL"}
            onValueChange={(value) => setBranchFilter(!value || value === "ALL" ? "" : value)}
          >
            <SelectTrigger className="md:w-[240px]">
              <SelectValue>
                {branchFilter
                  ? branches.find((branch) => branch.id === branchFilter)?.name ?? branchFilter
                  : t("surveys.allBranches")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("surveys.allBranches")}</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden border-border bg-white/95 bg-card/95">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs tracking-widertext-muted-foreground">
                <th className="px-4 py-3">{t("surveys.table.title")}</th>
                <th className="px-4 py-3">{t("surveys.table.branches")}</th>
                <th className="px-4 py-3">{t("surveys.table.channels")}</th>
                <th className="px-4 py-3">{t("surveys.table.questions")}</th>
                <th className="px-4 py-3">{t("surveys.table.responses")}</th>
                <th className="px-4 py-3">{t("surveys.table.status")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {surveysQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
                  </td>
                </tr>
              ) : filteredSurveys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {t("surveys.empty")}
                  </td>
                </tr>
              ) : (
                filteredSurveys.map((survey) => (
                  <tr key={survey.id} className="border-t border-border align-top">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-foreground">{survey.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {survey.description || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {survey.branch_names.join(", ")}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {survey.is_customer_display_active
                            ? t("surveys.channels.customerDisplayOn")
                            : t("surveys.channels.customerDisplayOff")}
                        </Badge>
                        <Badge variant="outline">
                          {survey.is_smart_table_active
                            ? t("surveys.channels.smartTableOn")
                            : t("surveys.channels.smartTableOff")}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{survey.question_count}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{survey.response_count}</td>
                    <td className="px-4 py-4">
                      <Badge variant={survey.is_active ? "default" : "secondary"}>
                        {survey.is_active ? t("common.active") : t("common.passive")}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        {canViewResponses ? (
                          <Button variant="ghost" size="sm" onClick={() => setResultsSurvey(survey)}>
                            <Eye className="h-4 w-4 text-blue-600" />
                          </Button>
                        ) : null}
                        {canManageSurvey ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingSurvey(survey)
                              setIsFormOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canManageSurvey ? (
                          <Button variant="ghost" size="sm" onClick={() => setSurveyToDelete(survey)}>
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SurveyFormDialog
        open={isFormOpen}
        onOpenChange={(next) => {
          setIsFormOpen(next)
          if (!next) setEditingSurvey(null)
        }}
        branches={branches}
        initialSurvey={editingSurvey}
        isSaving={isSaving}
        onSave={handleSaveSurvey}
      />

      <SurveyResponsesDialog
        open={!!resultsSurvey}
        onOpenChange={(next) => {
          if (!next) setResultsSurvey(null)
        }}
        surveyId={resultsSurvey?.id ?? null}
        surveyTitle={resultsSurvey?.title}
      />

      <AlertDialog open={!!surveyToDelete} onOpenChange={(open) => !open && setSurveyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("surveys.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("surveys.deleteDescription", { title: surveyToDelete?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDeleteSurvey()
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
