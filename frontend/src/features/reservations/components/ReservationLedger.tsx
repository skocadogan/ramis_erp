"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";
import { Plus, Loader2, Check, UserCircle, Ban, Trash2 } from "lucide-react";
import {
  fetchReservations,
  createReservation,
  reservationAction,
  deleteReservation,
  type ReservationDto,
} from "../services/reservationsApi";
import { TableSelect } from "@/features/tables/components/TableSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";




interface ReservationLedgerProps {
  branchId: string;
  canManage: boolean;
}

export function ReservationLedger({
  branchId,
  canManage,
}: ReservationLedgerProps) {
  const t = useTranslations("reservations");
  const qc = useQueryClient();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState("2");
  const [time, setTime] = useState("19:00");
  const [tableId, setTableId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReservationDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const list = useQuery({
    queryKey: ["reservations-api", branchId, day],
    queryFn: () => fetchReservations({ branch_id: branchId, scheduled_date: day }),
    enabled: !!branchId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["reservations-api", branchId, day] });
    void qc.invalidateQueries({ queryKey: queryKeys.tablesBase });
  };

  const submitCreate = async () => {
    if (!name.trim()) {
      toast.error(t("toast.customerNameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        branch: branchId,
        customer_name: name.trim(),
        customer_phone: phone,
        party_size: parseInt(party, 10) || 1,
        scheduled_date: day,
        scheduled_time: time.length === 5 ? `${time}:00` : time,
        duration_minutes: 120,
      };
      if (tableId) payload.table = tableId;
      await createReservation(payload);
      toast.success(t("toast.createSuccess"));
      setOpen(false);
      setName("");
      setPhone("");
      setTableId("");
      refresh();
    } catch (e) {
      toastApiError(e, t("toast.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteReservation(deleteTarget.id);
      toast.success(t("toast.deleteSuccess"));
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toastApiError(e, t("toast.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mb-8 flex flex-col overflow-hidden rounded-xl border border-border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border p-3 md:flex-row md:items-center justify-between border-border bg-muted/40 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-foreground">{t("ledger.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("ledger.description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm border-border bg-muted"
          />
          {canManage && (
            <Button
            
              onClick={() => setOpen(true)}
              className="gap-2">
              <Plus size={16} /> {t("ledger.new")}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        {list.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-600" />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground border-border">
              <tr>
                <th className="py-2 pr-2">{t("ledger.columns.time")}</th>
                <th className="py-2 pr-2">{t("ledger.columns.customer")}</th>
                <th className="py-2 pr-2">{t("ledger.columns.party")}</th>
                <th className="py-2 pr-2">{t("ledger.columns.table")}</th>
                <th className="py-2 pr-2">{t("ledger.columns.status")}</th>
                {canManage && <th className="py-2">{t("ledger.columns.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {(list.data as ReservationDto[] | undefined)?.map((r) => (
                <tr key={r.id} className="border-b border-border/80">
                  <td className="py-2 pr-2 font-mono text-xs">{r.scheduled_time?.slice(0, 5)}</td>
                  <td className="py-2 pr-2">{r.customer_name}</td>
                  <td className="py-2 pr-2">{r.party_size}</td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground">
                    {r.table_name ?? "—"}
                  </td>
                  <td className="py-2 pr-2 text-xs">{r.status_display}</td>
                  {canManage && (
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() =>
                              void reservationAction(r.id, "confirm")
                                .then(() => {
                                  toast.success(t("toast.confirmSuccess"));
                                  refresh();
                                })
                                .catch((e) => toastApiError(e, t("toast.actionFailed")))
                            }
                            className="rounded border border-border p-1 border-input"
                            title={t("ledger.confirmApproveTitle")}
                          >
                            <Check size={14} />
                          </button>
                        )}
                        {(r.status === "PENDING" || r.status === "CONFIRMED") && r.table && (
                          <button
                            type="button"
                            onClick={() =>
                              void reservationAction(r.id, "seat")
                                .then(() => {
                                  toast.success(t("toast.seatSuccess"));
                                  refresh();
                                })
                                .catch((e) => toastApiError(e, t("toast.actionFailed")))
                            }
                            className="rounded border border-border p-1 text-emerald-600 border-input"
                            title={t("ledger.confirmSeatTitle")}
                          >
                            <UserCircle size={14} />
                          </button>
                        )}
                        {r.status !== "CANCELLED" && r.status !== "COMPLETED" && (
                          <button
                            type="button"
                            onClick={() =>
                              void reservationAction(r.id, "cancel", { reason: "" })
                                .then(() => {
                                  toast.success(t("toast.cancelShortSuccess"));
                                  refresh();
                                })
                                .catch((e) => toastApiError(e, t("toast.actionFailed")))
                            }
                            className="rounded border border-border p-1 text-rose-600 border-input"
                            title={t("ledger.cancelActionTitle")}
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="rounded border border-border p-1 border-input"
                          title={t("ledger.deleteActionTitle")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {(list.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">{t("ledger.emptyDay")}</p>
          )}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent layout="scroll" size="md">
          <DialogHeader>
            <DialogTitle>{t("ledger.createTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="ledger-name">{t("ledger.namePlaceholder")}</Label>
              <Input
                id="ledger-name"
                placeholder={t("ledger.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ledger-phone">{t("ledger.phonePlaceholder")}</Label>
              <Input
                id="ledger-phone"
                placeholder={t("ledger.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div className="grid w-24 shrink-0 gap-2">
                <Label htmlFor="ledger-party">{t("ledger.partyPlaceholder")}</Label>
                <Input
                  id="ledger-party"
                  type="number"
                  min={1}
                  placeholder={t("ledger.partyPlaceholder")}
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                />
              </div>
              <div className="grid min-w-0 flex-1 gap-2">
                <Label htmlFor="ledger-time">{t("ledger.columns.time")}</Label>
                <Input
                  id="ledger-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("ledger.tableLabel")}</Label>
              <TableSelect
                value={tableId}
                onChange={setTableId}
                placeholder={t("ledger.tableNone")}
                allLabel={t("ledger.tableNone")}
                className="h-9 w-full"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              {t("ledger.dismiss")}
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void submitCreate()}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {t("ledger.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ledger.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                t.rich("ledger.deleteDescription", {
                  bold: (chunks) => (
                    <span className="font-medium text-foreground">{chunks}</span>
                  ),
                  customer: deleteTarget.customer_name,
                  time: deleteTarget.scheduled_time?.slice(0, 5) ?? "—",
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("ledger.dismiss")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 size={13} className="animate-spin" />}
              {deleting ? t("ledger.deleting") : t("ledger.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
