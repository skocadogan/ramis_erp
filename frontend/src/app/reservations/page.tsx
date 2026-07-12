'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { RefreshCw, DoorOpen, XCircle, Pencil, CalendarClock, Users, Loader2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/shell/AppShell';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useTables, useTableMutations } from '@/features/tables/hooks/useTables';
import { useBranchContext } from '@/hooks/useBranchContext';
import { toastApiError } from '@/lib/operationalToast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ReservationEditModal } from '@/features/reservations/components/ReservationEditModal';
import { ReservationLedger } from '@/features/reservations/components/ReservationLedger';
import { ReservationAlertSettingsPanel } from '@/features/reservations/components/ReservationAlertSettingsPanel';
import type { Table } from '@/features/tables/types/table.types';
import { formatDate } from '@/lib/formatters';

function formatScheduled(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return formatDate(iso);
    } catch {
        return '—';
    }
}

function ReservationsPageContent() {
    const t = useTranslations('reservations');
    const { canManage } = useModulePermissions();
    const canManageReservations = canManage('branches.manage_table');
    const canManageApiReservations = canManage('reservations.manage_reservation');

    const {
        branchList,
        setBranchOverride,
        effectiveBranchId,
        branchName,
        showBranchPicker,
    } = useBranchContext({ queryKey: 'reservations-context' });

    const { data: tables = [], isLoading, refetch } = useTables(
        effectiveBranchId ? { branch_id: effectiveBranchId, status: 'RESERVED' } : undefined
    );

    const { changeStatus, cancelReservation, updateTable, isPending } = useTableMutations();

    const [editTable, setEditTable] = useState<Table | null>(null);
    const [cancelTarget, setCancelTarget] = useState<Table | null>(null);
    const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);

    const handleOpenGuest = async (table: Table) => {
        try {
            await changeStatus({ id: table.id, action: 'open' });
            toast.success(t('toast.guestArrived', { name: table.name }));
        } catch (e) {
            toastApiError(e, t('toast.operationFailed'));
        }
    };

    const handleCancelConfirm = async () => {
        if (!cancelTarget) return;
        try {
            await cancelReservation(cancelTarget.id);
            setCancelTarget(null);
            toast.success(t('toast.cancelReservationSuccess'));
        } catch (e) {
            toastApiError(e, t('toast.cancelReservationFailed'));
        }
    };

    const handleEditSave = async (payload: {
        reservation_info: string;
        reservation_scheduled_at?: string | null;
        reservation_party_size?: number | null;
    }) => {
        if (!editTable) return;
        try {
            await updateTable({
                id: editTable.id,
                payload: {
                    reservation_info: payload.reservation_info,
                    reservation_scheduled_at: payload.reservation_scheduled_at ?? null,
                    reservation_party_size: payload.reservation_party_size,
                    status: 'RESERVED',
                },
            });
            setEditTable(null);
            toast.success(t('toast.updateSuccess'));
        } catch (e) {
            toastApiError(e, t('toast.updateFailed'));
        }
    };

    const noBranch = !effectiveBranchId;

    return (
        <AppShell>
            <div className="flex flex-col h-full">
                <div className="flex-1 space-y-6 overflow-auto p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-ui-bold text-foreground">{t('page.title')}</h1>
                                {canManageApiReservations && !noBranch && (
                                    <button
                                        type="button"
                                        onClick={() => setAlertSettingsOpen(true)}
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        title={t('alertSettings.title')}
                                    >
                                        <Settings size={16} />
                                    </button>
                                )}
                            </div>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                {t('page.subtitle')}
                            </p>
                            {branchName && (
                                <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                                    {t('page.branchLabel', { name: branchName })}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {showBranchPicker && (
                                <select
                                    value={effectiveBranchId}
                                    onChange={e => setBranchOverride(e.target.value)}
                                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                    aria-label={t('page.branchSelectAria')}
                                >
                                    {branchList.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                onClick={() => void refetch()}
                                disabled={isLoading || noBranch}
                                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                                {t('page.refresh')}
                            </button>
                        </div>
                    </div>

                    {noBranch ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {t('page.noBranch')}
                        </div>
                    ) : (
                        <ReservationLedger branchId={effectiveBranchId} canManage={canManageApiReservations} />
                    )}

                    {noBranch ? null : isLoading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                        </div>
                    ) : tables.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border py-16 text-center dark:border-slate-700">
                            <CalendarClock className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
                            <p className="text-sm font-ui-medium text-slate-600 dark:text-slate-300">
                                {t('page.emptyTablesTitle')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t.rich('page.emptyTablesHint', {
                                    link: (chunks) => (
                                        <Link href="/tables" className="text-blue-600 underline dark:text-blue-400">
                                            {chunks}
                                        </Link>
                                    ),
                                })}
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {tables.map((table) => (
                                <div
                                    key={table.id}
                                    className="flex flex-col rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                                >
                                    <div className="mb-3 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-lg font-ui-bold text-foreground">{table.name}</p>
                                            <p className="text-xs text-muted-foreground">{table.zone_name}</p>
                                        </div>
                                        <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-2xs font-ui-semibold uppercase tracking-wide text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                            {t('cards.badgeReserved')}
                                        </span>
                                    </div>
                                    <p className="mb-3 line-clamp-3 text-sm text-foreground">
                                        {table.reservation_info?.trim() || '—'}
                                    </p>
                                    <div className="mb-4 space-y-1.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <CalendarClock size={14} className="shrink-0 text-amber-600 dark:text-amber-500" />
                                            <span>{formatScheduled(table.reservation_scheduled_at)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Users size={14} className="shrink-0 text-amber-600 dark:text-amber-500" />
                                            <span>
                                                {t('cards.partyRow', {
                                                    party:
                                                        table.reservation_party_size != null
                                                            ? t('cards.people', {
                                                                  count: table.reservation_party_size,
                                                              })
                                                            : t('cards.dash'),
                                                    min: table.min_capacity,
                                                    max: table.capacity,
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                    {canManageReservations && (
                                        <div className="mt-auto flex flex-wrap gap-2 border-t border-amber-200/60 pt-3 dark:border-amber-900/40">
                                            <button
                                                type="button"
                                                onClick={() => void handleOpenGuest(table)}
                                                disabled={isPending}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-ui-medium text-white hover:bg-emerald-700 disabled:opacity-50 min-w-[120px]"
                                            >
                                                <DoorOpen size={14} />
                                                {t('actions.guestArrived')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditTable(table)}
                                                disabled={isPending}
                                                className="flex items-center justify-center gap-1 rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-ui-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                            >
                                                <Pencil size={14} />
                                                {t('actions.edit')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCancelTarget(table)}
                                                disabled={isPending}
                                                className="flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-ui-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                            >
                                                <XCircle size={14} />
                                                {t('actions.cancel')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {editTable && (
                <ReservationEditModal
                    table={editTable}
                    onClose={() => setEditTable(null)}
                    onSubmit={handleEditSave}
                    isSubmitting={isPending}
                />
            )}

            {alertSettingsOpen && (
                <ReservationAlertSettingsPanel
                    branchId={effectiveBranchId}
                    canManage={canManageApiReservations}
                    open={alertSettingsOpen}
                    onClose={() => setAlertSettingsOpen(false)}
                />
            )}

            <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('cancelModal.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {cancelTarget &&
                                t.rich('cancelModal.description', {
                                    bold: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                                    name: cancelTarget.name,
                                })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>{t('cancelModal.dismiss')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleCancelConfirm();
                            }}
                            disabled={isPending}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {isPending && <Loader2 size={13} className="animate-spin" />}
                            {t('cancelModal.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppShell>
    );
}

export default function ReservationsPage() {
    return (
        <AuthGuard module="reservations">
            <ReservationsPageContent />
        </AuthGuard>
    );
}
