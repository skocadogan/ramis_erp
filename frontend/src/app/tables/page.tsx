'use client';

import { useState, useMemo } from 'react';
import { Plus, RefreshCw, Loader2, MapPinned, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/shell/AppShell';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { AuthGuard } from '@/components/auth/AuthGuard';
import {
    useTables,
    useZones,
    useZoneSummary,
    useTableMutations,
} from '@/features/tables/hooks/useTables';
import { useBranchContext } from '@/hooks/useBranchContext';
import { toastApiError, toastApiSuccess } from '@/lib/operationalToast';
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
import { ZoneSummaryBar } from '@/features/tables/components/ZoneSummaryBar';
import { ZoneManageModal } from '@/features/tables/components/ZoneManageModal';
import { TableGrid } from '@/features/tables/components/TableGrid';
import { TableFormModal } from '@/features/tables/components/TableFormModal';
import { TableReserveModal } from '@/features/tables/components/TableReserveModal';
import { TableOrderModal } from '@/features/tables/components/TableOrderModal';
import { TableQRCodeModal } from '@/features/tables/components/TableQRCodeModal';
import { TableSync } from '@/features/pos/components/TableSync';
import type { Table, TableCreatePayload, TableReservePayload } from '@/features/tables/types/table.types';
import { mergeZoneSummaryWithTables } from '@/features/tables/utils/mergeZoneSummaryWithTables';
import { TableSettingsPanel } from '@/features/tables/components/TableSettingsPanel';
import type { Branch } from '@/types/user.types';

function TablesPageContent() {
    const { canManage } = useModulePermissions();
    const canManageTables = canManage('branches.manage_table');
    const canManageZones = canManage('branches.manage_zone');

    const {
        branchList,
        setBranchOverride,
        effectiveBranchId,
        branchName,
        showBranchPicker,
    } = useBranchContext({ queryKey: 'tables-context' });

    const t = useTranslations('tables');
    const tGrid = useTranslations('tables.grid');
    const tForm = useTranslations('tables.form');
    const tZones = useTranslations('tables.zones');
    const tPos = useTranslations('pos');

    const [zoneManageOpen, setZoneManageOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const { data: tables = [], isLoading: tablesLoading, refetch: refetchTables } = useTables(
        effectiveBranchId ? { branch_id: effectiveBranchId } : undefined
    );
    const { data: zones = [], isLoading: zonesLoading, refetch: refetchZones } = useZones(effectiveBranchId);
    const { data: zoneSummary = [], isLoading: zonesSummaryLoading, refetch: refetchSummary } =
        useZoneSummary(effectiveBranchId || undefined);
    const { createTable, updateTable, deleteTable, changeStatus, forceCloseTable, isPending } = useTableMutations();

    const [editingTable, setEditingTable] = useState<Table | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<Table | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [reserveFor, setReserveFor] = useState<Table | null>(null);
    const [orderViewTable, setOrderViewTable] = useState<Table | null>(null);
    const [transferRequestFor, setTransferRequestFor] = useState<Table | null>(null);
    const [qrTable, setQrTable] = useState<Table | null>(null);

    const zonesForTableForm = useMemo(() => {
        const active = zones.filter(z => z.is_active && !z.is_takeaway);
        if (editingTable && !active.some(z => z.id === editingTable.zone)) {
            const cur = zones.find(z => z.id === editingTable.zone);
            if (cur) return [...active, cur];
        }
        return active;
    }, [zones, editingTable]);

    const branchesForZoneModal: Branch[] = useMemo(() => {
        if (branchList.length > 0) return branchList;
        if (!effectiveBranchId) return [];
        return [
            {
                id: effectiveBranchId,
                name: branchName ?? 'Şube',
                code: '',
                address: null,
                phone: null,
                email: null,
                website: null,
                tax_office: null,
                tax_number: null,
                registry_no: null,
                mersis_no: null,
                logo: null,
                users_count: 0,
                users_list: [],
            },
        ];
    }, [branchList, effectiveBranchId, branchName]);

    /** Özet kartları ve bölge sekmeleri, güncel masa listesiyle türetilir (WebSocket / durum API uyumu). */
    const zoneSummaryLive = useMemo(
        () => mergeZoneSummaryWithTables(tables, zoneSummary),
        [tables, zoneSummary]
    );

    const handleRefresh = async () => {
        await Promise.all([refetchTables(), refetchSummary(), refetchZones()]);
    };

    const handleCreateSubmit = async (payload: TableCreatePayload) => {
        try {
            await createTable(payload);
            setIsCreating(false);
            toastApiSuccess(t('messages.createSuccess'));
        } catch (e) {
            toastApiError(e, t('messages.createError'));
        }
    };

    const handleEdit = async (payload: TableCreatePayload) => {
        if (!editingTable) return;
        try {
            await updateTable({ id: editingTable.id, payload });
            setEditingTable(null);
            toastApiSuccess(t('messages.updateSuccess'));
        } catch (e) {
            toastApiError(e, t('messages.updateError'));
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        try {
            await deleteTable(deleteConfirm.id);
            setDeleteConfirm(null);
            toastApiSuccess(t('messages.deleteSuccess'));
        } catch (e) {
            toastApiError(e, t('messages.deleteError'));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleStatusChange = async (
        id: string,
        action: 'open' | 'close' | 'out_of_service' | 'start_cleaning' | 'finish_cleaning',
    ) => {
        try {
            await changeStatus({ id, action });
            const labels = {
                open: t('status_messages.open'),
                close: t('status_messages.close'),
                out_of_service: t('status_messages.out_of_service'),
                start_cleaning: t('status_messages.start_cleaning'),
                finish_cleaning: t('status_messages.finish_cleaning'),
            };
            toastApiSuccess(t('messages.statusChanged', { status: labels[action] }));
        } catch (e) {
            toastApiError(e, t('messages.statusError'));
        }
    };

    const handleReserveSubmit = async (payload: TableReservePayload) => {
        if (!reserveFor) return;
        try {
            await changeStatus({
                id: reserveFor.id,
                action: 'reserve',
                reservation_info: payload.reservation_info,
                reservation_scheduled_at: payload.reservation_scheduled_at,
                reservation_party_size: payload.reservation_party_size,
            });
            setReserveFor(null);
            toastApiSuccess(t('messages.reserveSuccess'));
        } catch (e) {
            toastApiError(e, t('messages.reserveError'));
        }
    };

    const handleForceClose = async (table: Table) => {
        try {
            await forceCloseTable(table.id);
            toastApiSuccess(t('messages.forceCloseSuccess'));
        } catch (e) {
            toastApiError(e, t('messages.forceCloseError'));
        }
    };

    const noBranchContext = !effectiveBranchId;

    return (
        <>
        <TableSync branchId={effectiveBranchId || undefined} />
        <AppShell>
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-auto p-6 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-ui-bold text-foreground">{t('pageTitle')}</h1>
                                {canManageTables && !noBranchContext && (
                                    <button
                                        type="button"
                                        onClick={() => setSettingsOpen(true)}
                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-700 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        title={t('settings.title')}
                                    >
                                        <Settings size={16} />
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {t('pageDesc')}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {showBranchPicker && (
                                <select
                                    value={effectiveBranchId}
                                    onChange={e => setBranchOverride(e.target.value)}
                                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card dark:border-slate-700 dark:text-slate-100"
                                    aria-label={tPos('gate.branchSelectPlaceholder')}
                                >
                                    {branchList.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button
                                onClick={() => void handleRefresh()}
                                disabled={tablesLoading || zonesLoading || zonesSummaryLoading || noBranchContext}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-border rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <RefreshCw
                                    size={13}
                                    className={tablesLoading || zonesLoading || zonesSummaryLoading ? 'animate-spin' : ''}
                                />
                                {tPos('misc.refresh')}
                            </button>
                            {canManageZones && !noBranchContext && (
                                <button
                                    type="button"
                                    onClick={() => setZoneManageOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-ui-medium text-slate-700 bg-white border border-border rounded-lg hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    <MapPinned size={15} />
                                    {tZones('title')}
                                </button>
                            )}
                            {canManageTables && !noBranchContext && (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-ui-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                                >
                                    <Plus size={15} />
                                    {tGrid('addTable')}
                                </button>
                            )}
                        </div>
                    </div>

                    {noBranchContext ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
                            {t('messages.noBranchContext')}
                        </div>
                    ) : (
                        <>
                            <ZoneSummaryBar zones={zoneSummaryLive} isLoading={zonesSummaryLoading} />

                            <TableGrid
                                tables={tables}
                                zones={zoneSummaryLive}
                                isLoading={tablesLoading}
                                canManage={canManageTables}
                                onEdit={t => setEditingTable(t)}
                                onDelete={t => setDeleteConfirm(t)}
                                onStatusChange={handleStatusChange}
                                onReserveRequest={t => setReserveFor(t)}
                                onViewOrder={t => setOrderViewTable(t)}
                                onTransferRequest={t => setTransferRequestFor(t)}
                                onQrCodeRequest={t => setQrTable(t)}
                                onForceClose={handleForceClose}
                            />
                        </>
                    )}
                </div>
            </div>

            {zoneManageOpen && effectiveBranchId && (
                <ZoneManageModal
                    branchId={effectiveBranchId}
                    branchName={branchName}
                    branches={branchesForZoneModal}
                    canPickBranch={branchList.length > 1}
                    canManage={canManageZones}
                    onClose={() => setZoneManageOpen(false)}
                />
            )}

            {settingsOpen && (
                <TableSettingsPanel
                    branchId={effectiveBranchId}
                    canManage={canManageTables}
                    open={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                />
            )}

            {reserveFor && (
                <TableReserveModal
                    table={reserveFor}
                    onClose={() => setReserveFor(null)}
                    onSubmit={handleReserveSubmit}
                    isSubmitting={isPending}
                />
            )}

            {isCreating && !noBranchContext && (
                <TableFormModal
                    zones={zonesForTableForm}
                    onClose={() => setIsCreating(false)}
                    onSubmit={handleCreateSubmit}
                    isSubmitting={isPending}
                />
            )}

            {editingTable && !noBranchContext && (
                <TableFormModal
                    table={editingTable}
                    zones={zonesForTableForm}
                    onClose={() => setEditingTable(null)}
                    onSubmit={handleEdit}
                    isSubmitting={isPending}
                />
            )}

            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tGrid('deleteTable')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteConfirm &&
                                tGrid.rich('deleteDesc', {
                                    name: deleteConfirm.name,
                                    b: (chunk) => <span className="font-medium text-foreground">{chunk}</span>,
                                })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{tForm('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDelete();
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {isDeleting && <Loader2 size={13} className="animate-spin" />}
                            {isDeleting ? tForm('saving') : t('form.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppShell>

            {orderViewTable && orderViewTable.active_order && (
                <TableOrderModal
                    tableId={orderViewTable.id}
                    tableName={orderViewTable.name}
                    onClose={() => setOrderViewTable(null)}
                    onActiveOrdersChanged={() => {
                        void handleRefresh();
                    }}
                    onPaymentComplete={() => {
                        setOrderViewTable(null);
                        void handleRefresh();
                    }}
                />
            )}

            {transferRequestFor && transferRequestFor.active_order && (
                <TableOrderModal
                    tableId={transferRequestFor.id}
                    tableName={transferRequestFor.name}
                    initialTransferMode={true}
                    onClose={() => setTransferRequestFor(null)}
                    onActiveOrdersChanged={() => {
                        void handleRefresh();
                    }}
                    onPaymentComplete={() => {
                        setTransferRequestFor(null);
                        void handleRefresh();
                    }}
                />
            )}

            {qrTable && (
                <TableQRCodeModal
                    table={qrTable}
                    onClose={() => setQrTable(null)}
                />
            )}
        </>
    );
}

export default function TablesPage() {
    return (
        <AuthGuard module="tables">
            <TablesPageContent />
        </AuthGuard>
    );
}
