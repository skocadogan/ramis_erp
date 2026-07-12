"use client";

import { Settings, Volume2, VolumeX, LayoutGrid, Printer as PrinterIcon, FileText, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTheme, type ThemePreference, type DensityPreference } from "@/components/shell/ThemeProvider";
import { useTranslations } from "next-intl";
import { usePosStore } from "@/store/usePosStore";
import api from "@/lib/api";
import { adminApi, type Printer, type ReceiptTemplate } from "@/features/admin/services/adminApi";
import { buildPosDisplayPageUrl } from "@/lib/runtimeConfig";
import type { PosTerminalSwitchRow } from "@/features/pos/components/PosTerminalSwitchDialog";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

interface PosSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  /** Yalnızca aktif terminaller (select seçenekleri) */
  terminals: PosTerminalSwitchRow[];
  variant?: "pos" | "waiter";
}

const WAITER_RECEIPT_CATEGORIES = new Set(["KITCHEN_TICKET", "WAITER_TICKET", "POS_RECEIPT"]);

function OrderPrintingSettings({
  t,
  autoPrintOrder,
  setAutoPrintOrder,
}: {
  t: ReturnType<typeof useTranslations<"pos.settings">>;
  autoPrintOrder: boolean;
  setAutoPrintOrder: (val: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-0.5">
        <label className="text-sm font-ui-semibold text-foreground">{t("printingOrder")}</label>
        <span className="text-2xs font-ui-medium text-muted-foreground">
          {t("printingOrderDesc")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 bg-background p-2 rounded-md">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="auto-print-order" className="text-xs font-ui-bold text-foreground">
            {t("autoPrintOrder")}
          </Label>
          <span className="text-[9px] text-muted-foreground uppercase tracking-tight">{t("autoPrintOrderDesc")}</span>
        </div>
        <Switch
          id="auto-print-order"
          checked={autoPrintOrder}
          onCheckedChange={setAutoPrintOrder}
        />
      </div>
    </div>
  );
}



export function PosSettingsDialog({
  open,
  onOpenChange,
  branchId,
  terminals,
  variant = "pos",
}: PosSettingsDialogProps) {
  const t = useTranslations("pos.settings");
  const { preference, setPreference, density, setDensity } = useTheme();

  const THEME_OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
    { id: "light", label: t("themes.light") },
    { id: "dark", label: t("themes.dark") },
    { id: "high-contrast", label: t("themes.high-contrast") },
    { id: "outdoor", label: t("themes.outdoor") },
    { id: "system", label: t("themes.system") },
  ];

  const DENSITY_OPTIONS: ReadonlyArray<{ id: DensityPreference; label: string }> = [
    { id: "compact", label: t("densities.compact") },
    { id: "comfortable", label: t("densities.comfortable") },
    { id: "spacious", label: t("densities.spacious") },
  ];
  const {
    showReadyNotifs, showWaiterCallNotifs, playNotifSound,
    terminalId, posTerminalUuid, showCustomerDisplay,
    paymentPrinters, autoPrintOrder, autoPrintPayment,
    setShowReadyNotifs, setShowWaiterCallNotifs, setPlayNotifSound, setShowCustomerDisplay, persistTerminalSelection,
    setPaymentPrinters, setAutoPrintOrder, setAutoPrintPayment,
    stockTrackingMode, setStockTrackingMode,
    performanceMode, setPerformanceMode,
    tableGridColumns, setTableGridColumns,
  } = usePosStore(useShallow((s) => ({
    showReadyNotifs: s.showReadyNotifs,
    showWaiterCallNotifs: s.showWaiterCallNotifs,
    playNotifSound: s.playNotifSound,
    showCustomerDisplay: s.showCustomerDisplay,
    terminalId: s.terminalId,
    posTerminalUuid: s.posTerminalUuid,
    paymentPrinters: s.paymentPrinters,
    autoPrintOrder: s.autoPrintOrder,
    autoPrintPayment: s.autoPrintPayment,
    setShowReadyNotifs: s.setShowReadyNotifs,
    setShowWaiterCallNotifs: s.setShowWaiterCallNotifs,
    setPlayNotifSound: s.setPlayNotifSound,
    setShowCustomerDisplay: s.setShowCustomerDisplay,
    persistTerminalSelection: s.persistTerminalSelection,
    setPaymentPrinters: s.setPaymentPrinters,
    setAutoPrintOrder: s.setAutoPrintOrder,
    setAutoPrintPayment: s.setAutoPrintPayment,
    stockTrackingMode: s.stockTrackingMode,
    setStockTrackingMode: s.setStockTrackingMode,
    performanceMode: s.performanceMode,
    setPerformanceMode: s.setPerformanceMode,
    tableGridColumns: s.tableGridColumns,
    setTableGridColumns: s.setTableGridColumns,
  })));

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);

  useEffect(() => {
    if (!open || !branchId) return;

    let cancelled = false;

    void adminApi.getPrinters({ branch_id: branchId, is_active: true }).then((data) => {
      if (cancelled) return;
      setPrinters("results" in data ? (data.results as Printer[]) : (data as unknown as Printer[]));
    });

    const loadTemplates = async () => {
      if (variant === "pos") {
        try {
          const data = await adminApi.getReceiptTemplates({ category: "POS_RECEIPT" });
          if (!cancelled) setTemplates(data);
          return;
        } catch {
          const all = await adminApi.getReceiptTemplates();
          if (!cancelled) {
            setTemplates(all.filter((tpl: ReceiptTemplate) => tpl.category === "POS_RECEIPT"));
          }
          return;
        }
      }

      try {
        const all = await adminApi.getReceiptTemplates();
        if (!cancelled) {
          setTemplates(all.filter((tpl: ReceiptTemplate) => WAITER_RECEIPT_CATEGORIES.has(tpl.category)));
        }
      } catch {
        if (!cancelled) setTemplates([]);
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [open, branchId, variant]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 text-foreground shadow-2xl ring-1 ring-border/60 sm:max-w-[700px]">
        <DialogHeader className="border-b border-border bg-muted/40 p-5 pb-3">
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Settings className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-ui-bold tracking-tight text-foreground">
              {t("title")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sub leading-relaxed text-muted-foreground">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className={`grid gap-x-8 gap-y-6 p-5 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin ${variant === "waiter" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
          {/* Sol Kolon */}
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="pos-notif-panel" className="text-sm font-ui-semibold text-foreground">
                  {t("notifPanel")}
                </Label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("notifPanelDesc")}
                </span>
              </div>
              <Switch
                id="pos-notif-panel"
                checked={showReadyNotifs}
                onCheckedChange={setShowReadyNotifs}
              />
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="pos-waiter-call-notifs" className="text-sm font-ui-semibold text-foreground">
                  {t("waiterCallNotifs")}
                </Label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("waiterCallNotifsDesc")}
                </span>
              </div>
              <Switch
                id="pos-waiter-call-notifs"
                checked={showWaiterCallNotifs}
                onCheckedChange={setShowWaiterCallNotifs}
              />
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="pos-notif-sound" className="text-sm font-ui-semibold text-foreground">
                    {t("notifSound")}
                  </Label>
                  {playNotifSound ? (
                    <Volume2 size={12} className="text-blue-600 dark:text-blue-400" />
                  ) : (
                    <VolumeX size={12} className="text-muted-foreground" />
                  )}
                </div>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("notifSoundDesc")}
                </span>
              </div>
              <Switch
                id="pos-notif-sound"
                checked={playNotifSound}
                onCheckedChange={setPlayNotifSound}
              />
            </div>

            <div className="h-px bg-border" />

            {variant === "pos" ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="pos-customer-display" className="text-sm font-ui-semibold text-foreground">
                  {t("showCustomerDisplay")}
                </Label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("showCustomerDisplayDesc")}
                </span>
              </div>
              <Switch
                id="pos-customer-display"
                checked={showCustomerDisplay}
                onCheckedChange={setShowCustomerDisplay}
              />
            </div>
            ) : null}

            {variant === "pos" ? <div className="h-px bg-border" /> : null}

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("stockTracking")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("stockTrackingDesc")}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStockTrackingMode("PRODUCT")}
                  className={`flex-1 rounded-lg py-2 text-center text-xs font-ui-bold transition-all ${stockTrackingMode === "PRODUCT"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 dark:shadow-blue-900/40"
                      : "border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                >
                  {t("stockByProduct")}
                </button>
                <button
                  type="button"
                  onClick={() => setStockTrackingMode("INGREDIENT")}
                  className={`flex-1 rounded-lg py-2 text-center text-xs font-ui-bold transition-all ${stockTrackingMode === "INGREDIENT"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/25 dark:shadow-blue-900/40"
                      : "border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                >
                  {t("stockByIngredient")}
                </button>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Performance Mode (F-9) */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label htmlFor="pos-perf-mode" className="text-sm font-ui-semibold text-foreground">
                  {t("lowPowerMode")}
                </Label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("lowPowerModeDesc")}
                </span>
              </div>
              <Switch
                id="pos-perf-mode"
                checked={performanceMode}
                onCheckedChange={setPerformanceMode}
              />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("appearance")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("appearanceDesc")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPreference(opt.id)}
                    className={`rounded-lg py-1.5 text-center text-2xs font-ui-bold transition-all ${preference === opt.id
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("density")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("densityDesc")}
                </span>
              </div>
              <div className="flex gap-2">
                {DENSITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDensity(opt.id)}
                    className={`flex-1 rounded-lg py-1.5 text-center text-2xs font-ui-bold transition-all ${density === opt.id
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("tableLayoutCols")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("tableLayoutColsDesc")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["auto", "1", "2", "3", "4"] as const).map((colVal) => (
                  <button
                    key={colVal}
                    type="button"
                    onClick={() => setTableGridColumns(colVal)}
                    className={`flex-1 min-w-[70px] rounded-lg py-1.5 text-center text-2xs font-ui-bold transition-all ${tableGridColumns === colVal
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                  >
                    {t(`tableLayoutColsOptions.${colVal}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("terminal")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("terminalDesc")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={posTerminalUuid || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const t = terminals.find((x) => x.id === id);
                    if (t) persistTerminalSelection(t.code, t.id);
                  }}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t("terminalSelect")}</option>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const tid = terminalId.trim();
                    if (!tid || !branchId) return;
                    try {
                      const { data } = await api.get<{ display_token: string }>(
                        "/pos-display/ws-subscribe-token/",
                        { params: { terminal_id: tid, branch_id: branchId } }
                      );
                      const url = buildPosDisplayPageUrl(tid, data.display_token, branchId);
                      window.open(url, "_blank", "noopener,noreferrer");
                    } catch {
                      console.error("[POS] Müşteri ekranı token alınamadı");
                    }
                  }}
                  className="rounded-md border border-border bg-muted p-1.5 text-muted-foreground transition-all hover:border-blue-500/40 hover:bg-accent hover:text-blue-600 dark:hover:text-blue-400"
                  title={t("openDisplay")}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>

            {variant === "waiter" ? (
              <>
                <div className="h-px bg-border" />
                <OrderPrintingSettings
                  t={t}
                  autoPrintOrder={autoPrintOrder}
                  setAutoPrintOrder={setAutoPrintOrder}
                />
              </>
            ) : null}
          </div>

          {variant === "pos" ? (
          <div className="space-y-5">
            <OrderPrintingSettings
              t={t}
              autoPrintOrder={autoPrintOrder}
              setAutoPrintOrder={setAutoPrintOrder}
            />

            <div className="h-px bg-border" />

            <div className="space-y-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-ui-semibold text-foreground">{t("printingPayment")}</label>
                <span className="text-2xs font-ui-medium text-muted-foreground">
                  {t("printingPaymentDesc")}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 bg-background p-2 rounded-md">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="auto-print-payment" className="text-xs font-ui-bold text-foreground">
                    {t("autoPrintPayment")}
                  </Label>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-tight">{t("autoPrintPaymentDesc")}</span>
                </div>
                <Switch
                  id="auto-print-payment"
                  checked={autoPrintPayment}
                  onCheckedChange={setAutoPrintPayment}
                />
              </div>

              <div className="space-y-2">
                {paymentPrinters.map((row, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-md border border-border bg-muted/10">
                    <div className="flex items-center gap-2">
                      <PrinterIcon size={12} className="text-muted-foreground" />
                      <select
                        value={row.printerId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = paymentPrinters.map((p, i) =>
                            i === idx ? { ...p, printerId: val } : p
                          );
                          setPaymentPrinters(next);
                        }}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sub text-foreground"
                      >
                        <option value="">{t("printerSelect")}</option>
                        {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => setPaymentPrinters(paymentPrinters.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText size={12} className="text-muted-foreground" />
                      <select
                        value={row.templateSlug}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = paymentPrinters.map((p, i) =>
                            i === idx ? { ...p, templateSlug: val } : p
                          );
                          setPaymentPrinters(next);
                        }}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sub text-foreground"
                      >
                        <option value="">{t("templateSelect")}</option>
                        {templates.map((temp) => <option key={temp.slug} value={temp.slug}>{temp.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPaymentPrinters([...paymentPrinters, { printerId: "", templateSlug: "" }])}
                  className="w-full py-1 text-sub font-ui-bold border border-dashed border-border rounded hover:bg-muted transition-colors"
                >
                  {t("addPrinter")}
                </button>
              </div>
            </div>
          </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-border bg-background p-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg bg-primary px-6 py-2 text-xs font-ui-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95"
          >
            {t("close")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
