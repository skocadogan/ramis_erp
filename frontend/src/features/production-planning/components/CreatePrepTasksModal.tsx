"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { format, parseISO } from "date-fns"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Clock, Users, UtensilsCrossed, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { toastApiError } from "@/lib/operationalToast"
import { useCreatePrepTasks } from "../hooks/useProductionPlanning"

interface PlanLine {
  id: string
  product_name?: string
  target_quantity: number
  station_name?: string
}

interface CreatePrepTasksModalProps {
  isOpen: boolean
  onClose: () => void
  planId: string
  planDate: string
  planLines: PlanLine[]
  /** Şubedeki kullanıcı listesi (atama için) */
  staffList?: { id: string; name: string }[]
}

export default function CreatePrepTasksModal({
  isOpen,
  onClose,
  planId,
  planDate,
  planLines,
  staffList = [],
}: CreatePrepTasksModalProps) {
  const t = useTranslations("production")
  const { mutate: createPrepTasks, isPending } = useCreatePrepTasks()

  // Her satır için seçim durumu
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  // Her satır için scheduled_start (ISO string)
  const [startTimes, setStartTimes] = useState<Record<string, string>>({})
  // Her satır için deadline (ISO string)
  const [deadlines, setDeadlines] = useState<Record<string, string>>({})
  // Her satır için atanan kullanıcı ID'leri (sistem kullanıcıları)
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  // Her satır için manuel isim girişi (sisteme kayıtlı olmayan kişiler)
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string[]>>({})

  // Tümünü seç / seçme
  const allSelected = selectedLines.size === planLines.length && planLines.length > 0
  const [, setSelectAll] = useState(true)

  // Varsayılan saatleri hesapla (plan_date + 08:00 başlangıç, + 23:59 bitiş)
  useEffect(() => {
    if (isOpen && planDate) {
      const defaultStart = `${planDate}T08:00:00`
      const defaultDeadline = `${planDate}T23:59:59`
      const newStartTimes: Record<string, string> = {}
      const newDeadlines: Record<string, string> = {}
      const newSelected = new Set<string>()

      planLines.forEach((line) => {
        newStartTimes[line.id] = defaultStart
        newDeadlines[line.id] = defaultDeadline
        newSelected.add(line.id)
      })

      setStartTimes(newStartTimes)
      setDeadlines(newDeadlines)
      setSelectedLines(newSelected)
      setAssignments({})
      setAssigneeNames({})
      setSelectAll(true)
    }
  }, [isOpen, planDate, planLines])

  const toggleLine = (id: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedLines(new Set())
      setSelectAll(false)
    } else {
      setSelectedLines(new Set(planLines.map((l) => l.id)))
      setSelectAll(true)
    }
  }

  const updateStartTime = (id: string, val: string) => {
    setStartTimes((prev) => ({ ...prev, [id]: val }))
  }

  const updateDeadline = (id: string, val: string) => {
    setDeadlines((prev) => ({ ...prev, [id]: val }))
  }

  const toggleStaff = (lineId: string, userId: string) => {
    setAssignments((prev) => {
      const current = prev[lineId] || []
      const next = current.includes(userId)
        ? current.filter((u) => u !== userId)
        : [...current, userId]
      return { ...prev, [lineId]: next }
    })
  }

  // Manuel isim girişi
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({})
  const addName = (lineId: string) => {
    const name = (nameInputs[lineId] || "").trim()
    if (!name) return
    setAssigneeNames((prev) => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), name],
    }))
    setNameInputs((prev) => ({ ...prev, [lineId]: "" }))
  }
  const removeName = (lineId: string, index: number) => {
    setAssigneeNames((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = () => {
    const selectedIds = Array.from(selectedLines)
    if (selectedIds.length === 0) {
      toast.error(t("page.createTasks.noSelection"))
      return
    }

    const taskData = selectedIds
      .map((lineId) => {
        const line = planLines.find((l) => l.id === lineId)
        if (!line) return null
        return {
          plan_line_id: lineId,
          scheduled_start: startTimes[lineId]
            ? new Date(startTimes[lineId]).toISOString()
            : undefined,
          deadline: deadlines[lineId]
            ? new Date(deadlines[lineId]).toISOString()
            : undefined,
          assigned_user_ids: assignments[lineId] || [],
          assignee_names: assigneeNames[lineId] || [],
        }
      })
      .filter(Boolean) as {
      plan_line_id: string
      scheduled_start?: string
      deadline?: string
      assigned_user_ids?: string[]
      assignee_names?: string[]
    }[]

    createPrepTasks(
      { planId, data: taskData },
      {
        onSuccess: () => {
          toast.success(t("page.toast.prepTasksCreated"))
          onClose()
        },
        onError: (err) => toastApiError(err, t("page.toast.prepTasksCreateError")),
      }
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="3xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-blue-500" />
            {t("page.createTasks.title")}
          </DialogTitle>
          <DialogDescription>
            {t("page.createTasks.description", {
              date: planDate ? format(parseISO(planDate), "dd.MM.yyyy") : "",
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {/* Select All Row */}
          <div className="mb-2 flex items-center gap-3 border-b border-border py-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              id="select-all"
            />
            <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              {t("page.createTasks.selectAll")}
            </Label>
          </div>

          {/* Plan Lines */}
          {planLines.map((line) => (
            <div
              key={line.id}
              className={`rounded-lg border p-3 mb-3 transition-colors ${
                selectedLines.has(line.id)
                  ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20"
                  : "border-border bg-background"
              }`}
            >
              {/* Header Row: Checkbox + Product Info */}
              <div className="flex items-start gap-3 mb-3">
                <Checkbox
                  checked={selectedLines.has(line.id)}
                  onCheckedChange={() => toggleLine(line.id)}
                  id={`line-${line.id}`}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`line-${line.id}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {line.product_name || "—"}
                  </Label>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>
                      {t("page.createTasks.quantity")}:{" "}
                      <strong>{line.target_quantity}</strong>
                    </span>
                    {line.station_name && (
                      <span>
                        {t("page.createTasks.station")}:{" "}
                        <strong>{line.station_name}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings Row: Time + Staff - only show if selected */}
              {selectedLines.has(line.id) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-9">
                  {/* Start Time */}
                  <div>
                    <Label className="text-2xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("page.createTasks.startTime")}
                    </Label>
                    <Input
                      type="datetime-local"
                      size={1}
                      className="h-8 text-xs"
                      value={
                        startTimes[line.id]
                          ? startTimes[line.id].slice(0, 16)
                          : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) updateStartTime(line.id, `${val}:00`)
                      }}
                    />
                  </div>

                  {/* Deadline */}
                  <div>
                    <Label className="text-2xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("page.createTasks.deadline")}
                    </Label>
                    <Input
                      type="datetime-local"
                      size={1}
                      className="h-8 text-xs"
                      value={
                        deadlines[line.id]
                          ? deadlines[line.id].slice(0, 16)
                          : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) updateDeadline(line.id, `${val}:00`)
                      }}
                    />
                  </div>

                  {/* Staff Assignment */}
                  <div className="space-y-2">
                    <Label className="text-2xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t("page.createTasks.staff")}
                    </Label>

                    {/* Sistem kullanıcıları */}
                    {staffList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {staffList.map((staff) => {
                          const isAssigned = (
                            assignments[line.id] || []
                          ).includes(staff.id)
                          return (
                            <button
                              key={staff.id}
                              type="button"
                              onClick={() => toggleStaff(line.id, staff.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                isAssigned
                                  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-700"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                            >
                              {staff.name}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Manuel isim girişi */}
                    <div className="flex gap-1.5">
                      <Input
                        size={1}
                        placeholder={t("page.createTasks.namePlaceholder")}
                        className="h-7 text-xs flex-1 min-w-0"
                        value={nameInputs[line.id] || ""}
                        onChange={(e) =>
                          setNameInputs((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addName(line.id)
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => addName(line.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Eklenen isimler (tag olarak) */}
                    {(assigneeNames[line.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(assigneeNames[line.id] || []).map((name, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:ring-amber-700"
                          >
                            {name}
                            <button
                              type="button"
                              onClick={() => removeName(line.id, idx)}
                              className="hover:text-amber-900 dark:hover:text-amber-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("page.confirm.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedLines.size === 0 || isPending}
          >
            {isPending
              ? t("page.createTasks.creating")
              : t("page.createTasks.create", { count: selectedLines.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
