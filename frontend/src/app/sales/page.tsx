"use client";

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/shell/AppShell';
import { Loader2, RotateCcw, FileSpreadsheet, FileText } from 'lucide-react';
import { adminApi } from '@/features/admin/services/adminApi';
import { toast } from 'sonner';
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { Button } from '@/components/ui/button';
import { TableSelect } from '@/features/tables/components/TableSelect';
import { CashierSelect } from '@/features/admin/components/tabs/CashierSelect';

import { SalesStats } from '@/features/sales/components/SalesStats';
import { SalesTable } from '@/features/sales/components/SalesTable';
import { SalesPeriodFilter, type SalesPeriodFilterI18n } from '@/features/sales/components/SalesPeriodFilter';
const ProductSalesAnalytics = dynamic(
    () => import('@/features/sales/components/ProductSalesAnalytics').then(m => ({ default: m.ProductSalesAnalytics })),
    { ssr: false, loading: () => <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin size-8 text-muted-foreground" /></div> }
);
const MenuEngineeringAnalytics = dynamic(
    () => import('@/features/sales/components/MenuEngineeringAnalytics').then(m => ({ default: m.MenuEngineeringAnalytics })),
    { ssr: false, loading: () => <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin size-8 text-muted-foreground" /></div> }
);
import { SalesCancellationsPanel } from '@/features/sales/components/SalesCancellationsPanel';
import { useSalesCancellations } from '@/features/sales/hooks/useSalesCancellations';
import type { CancellationRecord } from '@/features/sales/types';

const TableOrderModal = dynamic(() => import('@/features/tables/components/TableOrderModal').then(mod => mod.TableOrderModal), { ssr: false });
const EditSaleModal = dynamic(() => import('@/features/sales/components/SalesModals').then(mod => mod.EditSaleModal), { ssr: false });
const ConfirmModals = dynamic(() => import('@/features/sales/components/SalesModals').then(mod => mod.ConfirmModals), { ssr: false });

import { useSales, sumSaleMoneyTotals } from '@/features/sales/hooks/useSales';
import type { TabType, Sale } from '@/features/sales/types';
import { useSalesActions } from '@/features/sales/hooks/useSalesActions';
import { BranchSelect } from '@/features/branches/components/BranchSelect';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { CreateInvoiceModal } from '@/features/invoices/components/CreateInvoiceModal';
import { AuthGuard } from '@/components/auth/AuthGuard';


function SalesPageContent() {
    const t = useTranslations('sales');
    const canViewAmounts = useCanViewAmounts();
    const { canManage } = useModulePermissions();
    const canInvoice = canManage('invoices.manage_invoice');
    const sales = useSales();
    const cancellations = useSalesCancellations({
        enabled: sales.activeTab === 'cancellations',
        branchId: sales.branchId,
        startDate: sales.startDate,
        endDate: sales.endDate,
        dateRangePreset: sales.dateRangePreset,
    });
    const actions = useSalesActions({
        fetchSummary: sales.fetchSummary
    });

    // ── Table & Cashier select data ──────────────────────────────────────────
    // (TableSelect ve CashierSelect kendi verilerini çeker)

    // Local UI state for viewing details (TableOrderModal)
    const [viewSale, setViewSale] = React.useState<Sale | null>(null);
    const [viewCancellation, setViewCancellation] = React.useState<CancellationRecord | null>(null);
    const [invoiceSale, setInvoiceSale] = React.useState<Sale | null>(null);
    const [isExporting, setIsExporting] = React.useState(false);

    const filteredSales = sales.sales;

    const filteredSalesMoney = useMemo(() => sumSaleMoneyTotals(filteredSales), [filteredSales]);

    const isAtDefaultTodayFilters =
        sales.paymentFilter === 'ALL' &&
        sales.branchId === 'ALL' &&
        !sales.search.trim() &&
        !sales.discountOnly &&
        sales.dateRangePreset === 'today';

    const periodI18n = useMemo<SalesPeriodFilterI18n>(
        () => ({
            periodLabel: t('periodFilter.label'),
            selectPlaceholder: t('periodFilter.selectPlaceholder'),
            groupAriaLabel: t('periodFilter.groupAriaLabel'),
            selectAriaLabel: t('periodFilter.selectAriaLabel'),
            presets: {
                today: t('presets.today'),
                this_week: t('presets.this_week'),
                last_week: t('presets.last_week'),
                this_month: t('presets.this_month'),
                last_month: t('presets.last_month'),
                last_3_months: t('presets.last_3_months'),
                last_6_months: t('presets.last_6_months'),
                last_9_months: t('presets.last_9_months'),
                this_year: t('presets.this_year'),
                custom: t('presets.custom'),
            },
        }),
        [t]
    );

    const handleExportPdf = async () => {
        setIsExporting(true);
        const toastId = toast.loading(t('export.pdfLoading'));
        try {
            const params = {
                branch_id: sales.branchId === 'ALL' ? undefined : sales.branchId,
                payment_method: sales.paymentFilter === 'ALL' ? undefined : sales.paymentFilter,
                start_date: sales.startDate,
                end_date: sales.endDate,
                discount_only: sales.discountOnly,
            };

            const blob = await adminApi.exportSalesPdf(params);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement("a");
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', t('export.salesPdfFilename', { date: dateStr }));
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(t('export.pdfSuccess'), { id: toastId });
        } catch {
            toast.error(t('export.pdfError'), { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExcel = async () => {
        setIsExporting(true);
        const toastId = toast.loading(t('export.excelLoading'));
        try {
            const params = {
                branch_id: sales.branchId === 'ALL' ? undefined : sales.branchId,
                payment_method: sales.paymentFilter === 'ALL' ? undefined : sales.paymentFilter,
                start_date: sales.startDate,
                end_date: sales.endDate,
                discount_only: sales.discountOnly,
            };

            const blob = await adminApi.exportSalesExcel(params);
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement("a");
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', t('export.salesExcelFilename', { date: dateStr }));
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(t('export.excelSuccess'), { id: toastId });
        } catch {
            toast.error(t('export.excelError'), { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <AppShell>
            <div className="flex h-full flex-col bg-background overflow-hidden">
                {/* Tab Navigation */}
                <div className="flex items-center gap-1 border-b border-border px-4 bg-card border-border">
                    {([
                        { key: 'sales' as TabType, label: t('tabs.sales') },
                        { key: 'summary' as TabType, label: t('tabs.summary') },
                        { key: 'products' as TabType, label: t('tabs.products') },
                        { key: 'menu_engineering' as TabType, label: t('tabs.menuEngineering') },
                        { key: 'cancellations' as TabType, label: t('tabs.cancellations') },
                    ]).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => sales.setActiveTab(key)}
                            className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors
 ${sales.activeTab === key
 ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
 : 'border-transparent text-muted-foreground hover: hover:border-slate-300 dark:text-muted-foreground dark:hover:'
 }`}
                        >
                            {label}
                        </button>
                    ))}

                    <div className="ms-auto">
                        <BranchSelect
                            value={sales.branchId}
                            onChange={sales.setBranchId}
                            includeAll={true}
                            className="w-52"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4">
                    {sales.activeTab === 'summary' && (
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
                            <SalesStats summary={sales.summary} isLoading={sales.isSummaryLoading || sales.isSummaryFetching} />
                        </div>
                    )}

                    {sales.activeTab === 'products' && (
                        <ProductSalesAnalytics
                            branchId={sales.branchId}
                            startDate={sales.startDate}
                            endDate={sales.endDate}
                            dateRangePreset={sales.dateRangePreset}
                            periodI18n={periodI18n}
                            onDateSelect={(preset, range) => {
                                if (preset !== 'custom') {
                                    sales.setStartDate(range.start);
                                    sales.setEndDate(range.end);
                                }
                                sales.setDateRangePreset(preset);
                            }}
                            onStartDateChange={sales.setStartDate}
                            onEndDateChange={sales.setEndDate}
                        />
                    )}

                    {sales.activeTab === 'menu_engineering' && (
                        <MenuEngineeringAnalytics
                            branchId={sales.branchId}
                            startDate={sales.startDate}
                            endDate={sales.endDate}
                            dateRangePreset={sales.dateRangePreset}
                            periodI18n={periodI18n}
                            onDateSelect={(preset, range) => {
                                if (preset !== 'custom') {
                                    sales.setStartDate(range.start);
                                    sales.setEndDate(range.end);
                                }
                                sales.setDateRangePreset(preset);
                            }}
                            onStartDateChange={sales.setStartDate}
                            onEndDateChange={sales.setEndDate}
                        />
                    )}

                    {sales.activeTab === 'cancellations' && (
                        <SalesCancellationsPanel
                            branchId={sales.branchId}
                            startDate={sales.startDate}
                            endDate={sales.endDate}
                            dateRangePreset={sales.dateRangePreset}
                            periodI18n={periodI18n}
                            onDateSelect={(preset, range) => {
                                if (preset !== 'custom') {
                                    sales.setStartDate(range.start);
                                    sales.setEndDate(range.end);
                                }
                                sales.setDateRangePreset(preset);
                            }}
                            onStartDateChange={sales.setStartDate}
                            onEndDateChange={sales.setEndDate}
                            cancellations={cancellations}
                            onRowClick={setViewCancellation}
                        />
                    )}

                    {sales.activeTab === 'sales' && (
                        <>
                            {/* Filter Bar */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border bg-card border-border shrink-0">
                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                    {/* Table Select */}
                                    <TableSelect
                                        value={sales.tableId}
                                        onChange={sales.setTableId}
                                        className="w-full sm:w-[180px] h-9 border-border text-sm bg-muted border-input text-foreground"
                                    />

                                    {/* Cashier Select */}
                                    <CashierSelect
                                        value={sales.cashierId}
                                        onChange={sales.setCashierId}
                                        className="w-full sm:w-[200px] h-9 border-border text-sm bg-muted border-input text-foreground"
                                    />

                                    {sales.activeTab === 'sales' && (
                                        <select
                                            value={sales.paymentFilter}
                                            onChange={e => sales.setPaymentFilter(e.target.value)}
                                            className="border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground"
                                        >
                                            <option value="ALL">{t('payment.all')}</option>
                                            <option value="CASH">{t('payment.cash')}</option>
                                            <option value="CARD">{t('payment.card')}</option>
                                            <option value="OTHER">{t('payment.other')}</option>
                                            <option value="CREDIT">{t('payment.credit')}</option>
                                        </select>
                                    )}

                                    {sales.activeTab === 'sales' && (
                                        <div className="flex items-center gap-2 rounded-md border border-amber-200/90 bg-amber-50/80 px-2.5 py-1.5 dark:border-amber-800/50 dark:bg-amber-950/25">
                                            <span className="text-xs font-medium text-amber-900 dark:text-amber-200 whitespace-nowrap">
                                                {t('list.discountOnly')}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => sales.setDiscountOnly(!sales.discountOnly)}
                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${sales.discountOnly ? 'bg-amber-600' : ' bg-accent'
 }`}
                                            >
                                                <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${sales.discountOnly ? 'translate-x-4' : 'translate-x-0'
 }`} />
                                            </button>
                                        </div>
                                    )}
                                    <SalesPeriodFilter
                                        variant="list"
                                        activePreset={sales.dateRangePreset}
                                        i18n={periodI18n}
                                        onSelect={(preset, range) => {
                                            if (preset !== 'custom') {
                                                sales.setStartDate(range.start);
                                                sales.setEndDate(range.end);
                                            }
                                            sales.setDateRangePreset(preset);
                                        }}
                                    />
                                    {sales.dateRangePreset === 'custom' && (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <input
                                                type="date"
                                                value={sales.startDate}
                                                onChange={e => sales.setStartDate(e.target.value)}
                                                max={sales.endDate}
                                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                                            />
                                            <span className="text-muted-foreground text-sm">-</span>
                                            <input
                                                type="date"
                                                value={sales.endDate}
                                                onChange={e => sales.setEndDate(e.target.value)}
                                                min={sales.startDate}
                                                className="border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-muted border-input text-foreground h-9"
                                            />
                                        </div>
                                    )}

                                    {!isAtDefaultTodayFilters && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={sales.clearFilters}
                                            className="h-9 px-2 text-muted-foreground hover:text-rose-600"
                                        >
                                            <RotateCcw size={14} className="mr-1.5" />
                                            {t('list.reset')}
                                        </Button>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isExporting || sales.isLoading}
                                            onClick={handleExportExcel}
                                            className="h-9 px-2.5 text-emerald-600 border-emerald-100 hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20"
                                        >
                                            <FileSpreadsheet size={14} className="mr-1.5" />
                                            {isExporting ? t('list.exportBusy') : t('list.exportExcel')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isExporting || sales.isLoading}
                                            onClick={handleExportPdf}
                                            className="h-9 px-2.5 text-rose-600 border-rose-100 hover:bg-rose-50 dark:border-rose-900/30 dark:hover:bg-rose-950/20"
                                        >
                                            <FileText size={14} className="mr-1.5" />
                                            {isExporting ? t('list.exportBusy') : t('list.exportPdf')}
                                        </Button>
                                    </div>
                                </div>

                                {/* Summary Mini Stats */}
                                <div className="hidden lg:flex items-center gap-8 px-6 py-2 border-l border-slate-100 border-border">
                                    <div className="flex flex-col items-end">
                                        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('list.netTotal')}</span>
                                        <span className="text-base font-bold text-foreground leading-none">
                                            {canViewAmounts ? formatCurrency(sales.salesTotals.net) : AMOUNT_DISPLAY_MASK}
                                        </span>
                                        <span className="text-2xs text-muted-foreground/80 mt-1">
                                            {t('list.filterAmountLine', {
                                                amount: formatAmount(filteredSalesMoney.net, canViewAmounts),
                                            })}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('list.discount')}</span>
                                        <span className="text-base font-bold text-rose-600 dark:text-rose-400 leading-none">
                                            {canViewAmounts ? formatCurrency(sales.salesTotals.discount) : AMOUNT_DISPLAY_MASK}
                                        </span>
                                        <div className="h-[14px]" /> {/* Hizalama için boşluk */}
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('list.quantity')}</span>
                                        <span className="text-base font-bold text-blue-600 dark:text-blue-400 leading-none">
                                            {sales.totalCount}
                                        </span>
                                        <div className="h-[14px]" /> {/* Hizalama için boşluk */}
                                    </div>
                                </div>
                            </div>

                            {/* Main Content Area */}
                            <div className="p-3 flex-1 min-h-0 rounded-lg border border-border overflow-hidden flex flex-col shadow-sm bg-card border-border">

                                <div className="flex-1 overflow-auto overflow-x-hidden relative">
                                    {(sales.isLoading || sales.isFetching) && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] motion-reduce:backdrop-blur-none motion-reduce:bg-white/75 bg-card/60 dark:motion-reduce:/75">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={24} />
                                                <span className="text-xs font-medium text-muted-foreground">{t('list.loadingHint')}</span>
                                            </div>
                                        </div>
                                    )}
                                    <SalesTable
                                        sales={filteredSales}
                                        canManage={true}
                                        onRowClick={setViewSale}
                                        onEdit={actions.handleEditOpen}
                                        onDelete={actions.setDeleteSale}
                                        onInvoice={canInvoice ? (s) => setInvoiceSale(s) : undefined}
                                        infiniteControls={sales.infiniteControls}
                                    />
                                </div>

                                <div className="p-3 border-t border-slate-100 /50 flex items-center justify-between bg-card/50 border-border">
                                    <div className="text-xs text-muted-foreground font-medium">
                                        {t('list.paginationTotal', { count: sales.totalCount })}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            <EditSaleModal
                isOpen={!!actions.editSale}
                onClose={() => actions.setEditSale(null)}
                editForm={actions.editForm}
                setEditForm={actions.setEditForm}
                onSubmit={actions.handleEditSubmit}
                isSubmitting={actions.isEditSubmitting}
            />

            <ConfirmModals
                deleteSale={actions.deleteSale}
                onDeleteCancel={() => actions.setDeleteSale(null)}
                onDeleteConfirm={actions.handleDeleteConfirm}
                isDeleting={actions.isDeleting}
            />

            {viewSale && (
                <TableOrderModal
                    onClose={() => setViewSale(null)}
                    orderId={viewSale.order}
                    tableName={viewSale.table_name || ''}
                />
            )}

            {viewCancellation && (
                <TableOrderModal
                    onClose={() => setViewCancellation(null)}
                    orderId={viewCancellation.order_id}
                    tableName={viewCancellation.table_name || ''}
                />
            )}

            <CreateInvoiceModal
                sale={invoiceSale}
                onClose={() => setInvoiceSale(null)}
            />
        </AppShell>
    );
}

export default function SalesPage() {
    return (
        <AuthGuard module="sales">
            <SalesPageContent />
        </AuthGuard>
    );
}
