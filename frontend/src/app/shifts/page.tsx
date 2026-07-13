"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useBranchContext } from "@/hooks/useBranchContext";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { Loader2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import {
  fetchShiftsPage,
  closeShift,
  fetchZReport,
  addShiftExpense,
  updateShiftClosingInfo,
  fetchCashReport,
  addCashMovement,
} from "@/features/shifts/services/shiftsApi";
import { useActiveShift, useSyncShiftsAcrossTabs } from "@/features/shifts/hooks/useActiveShift";
import type { ShiftDto, ShiftStatus, ShiftZReportDto, ShiftCashReportDto } from "@/features/shifts/types";
import { ShiftsTable } from "@/features/shifts/components/ShiftsTable";
import { cn } from "@/lib/utils";

// Modal bileşenleri — sadece açıldığında yüklenir (~bundle azaltma)
const ZReportDialog = dynamic(
  () => import("@/features/shifts/components/ZReportDialog").then(m => m.ZReportDialog),
  { ssr: false, loading: () => null }
);
const CashReportDialog = dynamic(
  () => import("@/features/shifts/components/CashReportDialog").then(m => m.CashReportDialog),
  { ssr: false, loading: () => null }
);

const SalesRecordsTab = dynamic(
  () => import("@/features/shifts/components/SalesRecordsTab").then(m => ({ default: m.SalesRecordsTab })),
  { ssr: false, loading: () => <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div> }
);

type PosTerminalOption = { id: string; name: string; code: string };
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

function ShiftsPageContent() {
  const t = useTranslations("shifts");
  const canViewAmounts = useCanViewAmounts();
  const { canManage } = useModulePermissions();
  const canManageShift = canManage("shifts.manage_shift");
  const canEditClosedShift = canManage("shifts.edit_closed_shift") || canManageShift;
  const canClose = canManage("shifts.close_shift") || canManageShift;

  const { effectiveBranchId, showBranchPicker, branchList, setBranchOverride } =
    useBranchContext({ queryKey: "shifts-branch" });

  useSyncShiftsAcrossTabs(effectiveBranchId);

  const qc = useQueryClient();
  const { data: activeShift } = useActiveShift(effectiveBranchId);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | ShiftStatus>("all");
  const [filterTerminalId, setFilterTerminalId] = useState("");

  useEffect(() => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterStatus("all");
    setFilterTerminalId("");
  }, [effectiveBranchId]);

  const terminalsQuery = useQuery({
    queryKey: ["shifts-filters-terminals", effectiveBranchId],
    queryFn: async () => {
      const { data } = await api.get<unknown>("/pos-display/terminals/", {
        params: { branch_id: effectiveBranchId },
      });
      if (Array.isArray(data)) return data as PosTerminalOption[];
      const d = data as { results?: PosTerminalOption[] };
      return d.results ?? [];
    },
    enabled: !!effectiveBranchId,
    staleTime: 60_000,
  });

  const listQuery = useInfiniteQuery({
    queryKey: [
      "shifts-list",
      effectiveBranchId,
      filterDateFrom,
      filterDateTo,
      filterStatus,
      filterTerminalId,
    ],
    queryFn: ({ pageParam }) =>
      fetchShiftsPage({
        branch_id: effectiveBranchId ?? undefined,
        ...(filterStatus !== "all" ? { status: filterStatus } : {}),
        ...(filterDateFrom ? { date_from: filterDateFrom } : {}),
        ...(filterDateTo ? { date_to: filterDateTo } : {}),
        ...(filterTerminalId ? { opened_at_terminal: filterTerminalId } : {}),
        page: typeof pageParam === "number" ? pageParam : 1,
      }),
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      try {
        const url = new URL(lastPage.next, "http://local");
        const page = url.searchParams.get("page");
        return page ? parseInt(page, 10) : undefined;
      } catch {
        return undefined;
      }
    },
    initialPageParam: 1,
    enabled: !!effectiveBranchId,
  });

  const shifts = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [listQuery.data],
  );

  const terminalOptions = useMemo(() => {
    const fromApi = terminalsQuery.data ?? [];
    const map = new Map<string, PosTerminalOption>(
      fromApi.map((t) => [t.id, { ...t }])
    );
    for (const s of shifts) {
      const tid = s.opened_at_terminal;
      const tname = s.opened_at_terminal_name;
      if (tid && tname && !map.has(tid)) {
        map.set(tid, { id: tid, name: tname, code: "" });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [terminalsQuery.data, shifts]);

  const [zOpen, setZOpen] = useState<{ id: string; data: ShiftZReportDto } | null>(null);
  const [cashOpen, setCashOpen] = useState<{ id: string; data: ShiftCashReportDto } | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [actualOther, setActualOther] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [expShift, setExpShift] = useState<string | null>(null);
  const [expDesc, setExpDesc] = useState("");
  const [expAmt, setExpAmt] = useState("");
  const [cashMoveShift, setCashMoveShift] = useState<string | null>(null);
  const [cashMoveType, setCashMoveType] = useState<"IN" | "OUT">("IN");
  const [cashMoveDesc, setCashMoveDesc] = useState("");
  const [cashMoveAmt, setCashMoveAmt] = useState("");

  const [activeTab, setActiveTab] = useState<"shifts" | "sales">("shifts");

  const loadZ = async (id: string) => {
    try {
      const data = await fetchZReport(id);
      setZOpen({ id, data });
    } catch (e) {
      toastApiError(e, t("toast.zReportFailed"));
    }
  };

  const loadCash = async (id: string) => {
    try {
      const data = await fetchCashReport(id);
      setCashOpen({ id, data });
    } catch (e) {
      toastApiError(e, t("toast.cashReportFailed") || "Kasa Raporu yüklenemedi.");
    }
  };

  const submitCloseOrEdit = async () => {
    if (!closeId) return;
    setClosing(true);
    try {
      if (isEditMode) {
        await updateShiftClosingInfo(closeId, actualCash || "0", actualCard || "0", actualOther || "0", notes);
        toast.success(t("toast.shiftUpdated"));
      } else {
        await closeShift(closeId, actualCash || "0", actualCard || "0", actualOther || "0", notes);
        toast.success(t("toast.shiftClosed"));
      }
      setCloseId(null);
      setIsEditMode(false);
      setActualCash("");
      setActualCard("");
      setActualOther("");
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["shifts-list"] });
      void qc.invalidateQueries({ queryKey: ["active-shift"] });
    } catch (e) {
      toastApiError(e, isEditMode ? t("toast.updateFailed") : t("toast.closeFailed"));
    } finally {
      setClosing(false);
    }
  };

  const handleOpenCloseDialog = async (shift: ShiftDto) => {
    setCloseId(shift.id);
    setIsEditMode(false);
    setActualCash(shift.expected_cash || "0");
    setNotes("");
    try {
      const z = await fetchZReport(shift.id);
      setActualCard(String(z.payment_breakdown.CARD || 0));
      setActualOther(String(z.payment_breakdown.OTHER || 0));
    } catch (e) {
      console.error("Z prefill failed", e);
    }
  };

  const handleOpenEditDialog = (shift: ShiftDto) => {
    setCloseId(shift.id);
    setIsEditMode(true);
    setActualCash(shift.actual_cash || "0");
    setActualCard(shift.actual_card || "0");
    setActualOther(shift.actual_other || "0");
    setNotes(shift.notes || "");
  };

  const submitCashMovement = async () => {
    if (!cashMoveShift || !cashMoveAmt.trim()) return;
    try {
      await addCashMovement(cashMoveShift, cashMoveAmt, cashMoveType, cashMoveDesc.trim());
      toast.success(t("toast.cashMovementSaved"));
      setCashMoveShift(null);
      setCashMoveDesc("");
      setCashMoveAmt("");
      void qc.invalidateQueries({ queryKey: ["shifts-list"] });
    } catch (e) {
      toastApiError(e, t("toast.cashMovementFailed"));
    }
  };

  const submitExpense = async () => {
    if (!expShift || !expDesc.trim()) return;
    try {
      await addShiftExpense(expShift, expDesc.trim(), expAmt || "0");
      toast.success(t("toast.expenseSaved"));
      setExpShift(null);
      setExpDesc("");
      setExpAmt("");
      void qc.invalidateQueries({ queryKey: ["shifts-list"] });
    } catch (e) {
      toastApiError(e, t("toast.expenseFailed"));
    }
  };

  const exportParams = useMemo(() => ({
    branch_id: effectiveBranchId || "",
    status: filterStatus === "all" ? "" : filterStatus,
    date_from: filterDateFrom,
    date_to: filterDateTo,
    opened_at_terminal: filterTerminalId,
  }), [effectiveBranchId, filterStatus, filterDateFrom, filterDateTo, filterTerminalId]);

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("page.title")}</h1>
            
          </div>
          {showBranchPicker && (
            <select
              value={effectiveBranchId ?? ""}
              onChange={(e) => setBranchOverride(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm border-border bg-card text-foreground"
            >
              {branchList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {!effectiveBranchId ? (
          <p className="text-sm text-amber-700">{t("page.branchRequired")}</p>
        ) : (
          <>
            {/* Tab Menüsü */}
            <div className="mb-6 flex border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab("shifts")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold transition-all border-b-2 -mb-[2px] cursor-pointer",
                  activeTab === "shifts"
                    ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tabs.shifts")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sales")}
                className={cn(
                  "px-4 py-2 text-sm font-semibold transition-all border-b-2 -mb-[2px] cursor-pointer",
                  activeTab === "sales"
                    ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tabs.posRecords") || "POS Kayıtları"}
              </button>
            </div>

            {activeTab === "shifts" && (
              <>
                {activeShift ? (
                  <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <div className="flex flex-col gap-1">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300">{t("page.activeBannerTitle")}</div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-90">
                        <span>
                          {t("page.opening", {
                            amount: formatAmount(Number(activeShift.opening_cash), canViewAmounts),
                          })}
                        </span>
                        <span>
                          {t("page.terminal", {
                            name: activeShift.opened_at_terminal_name || t("page.terminalUnknown"),
                          })}
                        </span>
                        <span>
                          {t("page.openedBy", { name: activeShift.opened_by_name || t("page.dash") })}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mb-6 text-sm text-muted-foreground">
                    {t.rich("page.noActiveShift", {
                      pos: (chunks) => <strong className="text-foreground">{chunks}</strong>,
                    })}
                  </p>
                )}

                {listQuery.isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                ) : (
                  <Card className="bg-card py-0 gap-0">
                    <div className="border-b border-border px-4 py-3 border-border bg-muted/40">
                      <h2 className="text-sm font-semibold text-foreground">
                      {t("listCard.title")}

                      </h2>
                    
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="flex min-w-[9.5rem] flex-col gap-1">
                          <label
                            className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                            htmlFor="shift-filter-date-from"
                          >
                            {t("filters.dateFrom")}
                          </label>
                          <input
                            id="shift-filter-date-from"
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                          />
                        </div>
                        <div className="flex min-w-[9.5rem] flex-col gap-1">
                          <label
                            className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                            htmlFor="shift-filter-date-to"
                          >
                            {t("filters.dateTo")}
                          </label>
                          <input
                            id="shift-filter-date-to"
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                          />
                        </div>
                        <div className="flex min-w-[8rem] flex-col gap-1">
                          <label
                            className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                            htmlFor="shift-filter-status"
                          >
                            {t("filters.status")}
                          </label>
                          <select
                            id="shift-filter-status"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as "all" | ShiftStatus)}
                            className="rounded-lg border border-border px-2 py-1.5 text-sm border-input bg-card text-foreground"
                          >
                            <option value="all">{t("filters.all")}</option>
                            <option value="OPEN">{t("filters.statusOpen")}</option>
                            <option value="CLOSED">{t("filters.statusClosed")}</option>
                          </select>
                        </div>
                        <div className="flex min-w-[11rem] flex-1 flex-col gap-1 sm:min-w-[12rem]">
                          <label
                            className="text-sub font-medium uppercase tracking-wide text-muted-foreground"
                            htmlFor="shift-filter-terminal"
                          >
                            {t("filters.terminal")}
                          </label>
                          <select
                            id="shift-filter-terminal"
                            value={filterTerminalId}
                            onChange={(e) => setFilterTerminalId(e.target.value)}
                            disabled={terminalsQuery.isLoading}
                            className="rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-60 border-input bg-card text-foreground"
                          >
                            <option value="">{t("filters.all")}</option>
                            {terminalOptions.map((term) => (
                              <option key={term.id} value={term.id}>
                                {term.name}
                                {term.code ? ` (${term.code})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterDateFrom("");
                            setFilterDateTo("");
                            setFilterStatus("all");
                            setFilterTerminalId("");
                          }}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover: border-border bg-muted text-muted-foreground dark:hover:"
                        >
                          {t("filters.reset")}
                        </button>
                        <AsyncPdfExportButton
                          reportSlug="shift-list"
                          params={exportParams}
                          filename={`${t("export.filenamePrefix")}-${new Date().toISOString().split("T")[0]}.pdf`}
                          variant="default"
                          className="gap-2 text-white"
                        />
                      </div>
                    </div>
                    <CardContent className="p-0">
                      {shifts.length === 0 ? (
                        <p className="px-4 py-12 text-center text-sm text-muted-foreground dark:text-muted-foreground">{t("table.empty")}</p>
                      ) : (
                        <ShiftsTable
                          shifts={shifts}
                          canViewAmounts={canViewAmounts}
                          canManageShift={canManageShift}
                          canEditClosedShift={canEditClosedShift}
                          canClose={canClose}
                          onLoadZ={(id) => void loadZ(id)}
                          onLoadCash={(id) => void loadCash(id)}
                          onExpense={setExpShift}
                          onCashMovement={(id) => {
                            setCashMoveShift(id);
                            setCashMoveType("IN");
                          }}
                          onEdit={handleOpenEditDialog}
                          onClose={(shift) => void handleOpenCloseDialog(shift)}
                          infiniteControls={{
                            fetchNextPage: listQuery.fetchNextPage,
                            hasNextPage: !!listQuery.hasNextPage,
                            isFetchingNextPage: listQuery.isFetchingNextPage,
                          }}
                        />
                      )}
                    </CardContent>
                  </Card>
        )}
              </>
            )}

            {activeTab === "sales" && (
              <SalesRecordsTab
                branchId={effectiveBranchId}
                canViewAmounts={canViewAmounts}
                terminalOptions={terminalOptions}
              />
            )}
          </>
        )}

        {/* ── Modals ── */}
        {/* Vardiya kapatma / düzenleme */}
        <Dialog open={!!closeId} onOpenChange={(o) => !o && setCloseId(null)}>
          <DialogContent layout="scroll" size="md">
            <DialogHeader>
              <DialogTitle>{t("closeDialog.title")}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="close-cash">{t("closeDialog.countedCash")}</Label>
                <Input
                  id="close-cash"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="close-card">{t("closeDialog.card")}</Label>
                  <Input
                    id="close-card"
                    value={actualCard}
                    onChange={(e) => setActualCard(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="close-other">{t("closeDialog.other")}</Label>
                  <Input
                    id="close-other"
                    value={actualOther}
                    onChange={(e) => setActualOther(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="close-notes">{t("closeDialog.notes") || "Notlar"}</Label>
                <Textarea
                  id="close-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("closeDialog.notesPlaceholder") || "Açıklama..."}
                  className="min-h-0 resize-none"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCloseId(null)} disabled={closing}>
                {t("closeDialog.dismiss") || t("expenseDialog.cancel") || "İptal"}
              </Button>
              <Button type="button" disabled={closing} onClick={() => void submitCloseOrEdit()}>
                {closing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("closeDialog.submitting")}
                  </>
                ) : isEditMode ? (
                  t("closeDialog.update") || "Güncelle"
                ) : (
                  t("closeDialog.submit")
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!expShift} onOpenChange={(o) => !o && setExpShift(null)}>
          <DialogContent layout="scroll" size="md">
            <DialogHeader>
              <DialogTitle>{t("expenseDialog.title")}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <Input
                placeholder={t("expenseDialog.descriptionPlaceholder")}
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
              />
              <Input
                placeholder={t("expenseDialog.amountPlaceholder")}
                type="number"
                value={expAmt}
                onChange={(e) => setExpAmt(e.target.value)}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpShift(null)}>
                {t("expenseDialog.cancel") || "İptal"}
              </Button>
              <Button type="button" onClick={() => void submitExpense()}>
                {t("expenseDialog.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!cashMoveShift} onOpenChange={(o) => !o && setCashMoveShift(null)}>
          <DialogContent layout="scroll" size="md">
            <DialogHeader>
              <DialogTitle>{t("cashMovementDialog.title")}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCashMoveType("IN")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors",
                    cashMoveType === "IN"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                >
                  <ArrowUpCircle size={15} /> {t("cashMovementDialog.income")}
                </button>
                <button
                  type="button"
                  onClick={() => setCashMoveType("OUT")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors",
                    cashMoveType === "OUT"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                >
                  <ArrowDownCircle size={15} /> {t("cashMovementDialog.expense")}
                </button>
              </div>
              <Input
                placeholder={t("cashMovementDialog.descriptionPlaceholder")}
                value={cashMoveDesc}
                onChange={(e) => setCashMoveDesc(e.target.value)}
              />
              <Input
                placeholder={t("cashMovementDialog.amountPlaceholder")}
                type="number"
                min="0"
                step="0.01"
                value={cashMoveAmt}
                onChange={(e) => setCashMoveAmt(e.target.value)}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCashMoveShift(null)}>
                {t("cashMovementDialog.cancel") || "İptal"}
              </Button>
              <Button
                type="button"
                onClick={() => void submitCashMovement()}
                className={cashMoveType === "IN" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
              >
                {t("cashMovementDialog.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Z Raporu (ağır — ZReportDialog lazy) */}
        <ZReportDialog
          isOpen={!!zOpen}
          onOpenChange={(o) => !o && setZOpen(null)}
          data={zOpen?.data ?? null}
          shiftId={zOpen?.id ?? null}
        />
        {/* Kasa Raporu (ağır — CashReportDialog lazy) */}
        <CashReportDialog
          isOpen={!!cashOpen}
          onOpenChange={(o) => !o && setCashOpen(null)}
          data={cashOpen?.data ?? null}
          shiftId={cashOpen?.id ?? null}
        />
      </div>
    </AppShell>
  );
}

export default function ShiftsPage() {
  return (
    <AuthGuard module="shifts">
      <ShiftsPageContent />
    </AuthGuard>
  );
}
