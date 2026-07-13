'use client';

import { useMemo, useState } from 'react';
import { Loader2, MessageSquarePlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import api from '@/lib/api';
import { extractApiError, toastApiError, toastApiSuccess } from '@/lib/operationalToast';
import { Button } from '@/components/ui/button';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { TableTransferView } from './TableTransferView';
import { OrderItemsList } from './OrderItemsList';
import { DiscountPanel } from './DiscountPanel';
import { CashChangePanel } from './CashChangePanel';
import { OrderFooter } from './OrderFooter';
import { SaleDetailView } from './SaleDetailView';
import { OrderModalHeader } from './OrderModalHeader';
import { CancelConfirmationDialog } from './CancelConfirmationDialog';
import { KitchenResendConfirmationDialog } from './KitchenResendConfirmationDialog';
import { SaleReceiptPrintDialog } from './SaleReceiptPrintDialog';
import { useTableOrderModal } from './useTableOrderModal';
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
import { CreditPaymentModal } from '@/features/credit/components/CreditPaymentModal';
import { CustomerSelectModal } from '@/features/customers/components/CustomerSelectModal';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { publishPosCustomerDisplaySurveyPrompt } from '@/features/pos/lib/posCustomerDisplaySync';
import { usePosStore } from '@/store/usePosStore';
import { type TableOrderModalProps } from '@/features/tables/components/TableOrderModal/types';

export function TableOrderModal(props: TableOrderModalProps) {
    const t = useTranslations('tables.orderModal');
    const { tableName, orderId, tableId, onClose, onPaymentComplete, onNewOrder, hideDeliveredQuantityControls } = props;
    const activeBranchId = usePosStore((s) => s.activeBranchId);
    const terminalId = usePosStore((s) => s.terminalId);
    const displaySurveyPrompt = usePosStore((s) => s.displaySurveyPrompt);
    const displayCompletedSurveyContext = usePosStore((s) => s.displayCompletedSurveyContext);
    const { canManage } = useModulePermissions();
    const canOpenSurvey = canManage('pos.manage_display');
    const [showCustomerSelect, setShowCustomerSelect] = useState(false);
    const [isOpeningSurvey, setIsOpeningSurvey] = useState(false);

    const handleCloseModal = () => {
        const activeSessionId = displaySurveyPrompt?.session_id;
        if (activeSessionId && terminalId) {
            publishPosCustomerDisplaySurveyPrompt(null);
            void api.post('/guest-feedback/display/close/', {
                session_id: activeSessionId,
                terminal_code: terminalId,
            }).catch(() => undefined);
        }
        onClose();
    };

    const {
        // Data
        orders,
        sale,
        isLoading,
        error,
        grandTotal,
        totalOrderDiscount,
        subtotalBeforeOrderDiscount,
        hasActiveOrders,
        isHistoricalSaleView,
        hasSaleChanges,

        // Status & Auth
        canApplyDiscount,
        canManageTakeaway,

        // UI State
        paymentMethod,
        setPaymentMethod,
        creditAccountName,
        showCreditModal,
        setShowCreditModal,
        selectCreditAccount,
        isCreditSelected,
        useSplitPayment,
        setUseSplitPayment,
        splitAmounts,
        setSplitAmounts,
        isPaying,
        payError,
        isTransferring,
        setIsTransferring,
        allTables,
        searchTable,
        setSearchTable,
        isTransferLoading,
        showDiscountPanel,
        setShowDiscountPanel,
        discountType,
        setDiscountType,
        discountAmount,
        setDiscountAmount,
        discountOrderId,
        setDiscountOrderId,
        discountItemId,
        setDiscountItemId,
        isApplyingDiscount,
        discountError,
        setDiscountError,
        cashGiven,
        setCashGiven,
        isCancelling,
        isUpdatingItem,
        confirmCancel,
        setConfirmCancel,
        confirmKitchenResend,
        setConfirmKitchenResend,
        confirmKitchenResendUpdate,

        // Handlers
        handlePayment,
        handleSingleOrderPayment,
        handleTransferTable,
        applyDiscount,
        handleRemoveDiscount,
        handleSelectCustomer,
        fetchAllTables,
        processCancellation,
        handleUpdateItemQuantity,
        stockWarning,
        setStockWarning,
        handleReprintKitchen,
        handleReprintOrder,
        isReprinting,
        showSalePrintDialog,
        setShowSalePrintDialog,
        handleSalePrintConfirm,
        salePrintBranchId,
    } = useTableOrderModal({ ...props, onClose: handleCloseModal });

    const activeOrderId = orders[0]?.id ?? null;
    const isSurveyAnsweredFromApi = orders.some((order) => order.customer_display_survey_answered);
    const isSurveyAnsweredFromRealtime = Boolean(
        (sale?.id && displayCompletedSurveyContext?.saleId === sale.id) ||
        (activeOrderId && displayCompletedSurveyContext?.orderId === activeOrderId)
    );
    const isSurveyAnswered = isSurveyAnsweredFromApi || isSurveyAnsweredFromRealtime;

    const cashPanelVisible = useMemo(() =>
        (!useSplitPayment && paymentMethod === 'CASH') ||
        (useSplitPayment && (parseFloat(splitAmounts?.CASH || '0') > 0)),
        [useSplitPayment, paymentMethod, splitAmounts]
    );

    const cashTarget = useMemo(() =>
        useSplitPayment ? (parseFloat(splitAmounts?.CASH || '0')) : grandTotal,
        [useSplitPayment, splitAmounts, grandTotal]
    );

    const handleOpenSurvey = async () => {
        if (!sale?.id && !activeOrderId) {
            toast.error(t('surveyMissingContext'));
            return;
        }
        if (!terminalId) {
            toast.error(t('surveyMissingContext'));
            return;
        }

        setIsOpeningSurvey(true);
        try {
            const response = await api.post('/guest-feedback/display/open/', {
                ...(sale?.id ? { sale_id: sale.id } : {}),
                ...(!sale?.id && activeOrderId ? { order_id: activeOrderId } : {}),
                terminal_code: terminalId,
            });
            const prompt = response.data?.prompt ?? null;
            if (prompt) {
                publishPosCustomerDisplaySurveyPrompt(prompt);
            }
            toastApiSuccess(t('surveyOpened'));
        } catch (error) {
            toastApiError(error, t('surveyOpenFailed'));
        } finally {
            setIsOpeningSurvey(false);
        }
    };

    const canRenderSurveyButton = canOpenSurvey && Boolean(sale || orders.length > 0);

    const saleActionSlot = canRenderSurveyButton ? (
        <Button
            size="sm"
            variant="outline"
            onClick={() => void handleOpenSurvey()}
            disabled={isOpeningSurvey || isSurveyAnswered}
            className="h-8 gap-1.5"
        >
            <MessageSquarePlus size={14} />
            {isOpeningSurvey ? t('openingSurvey') : t('openSurvey')}
        </Button>
    ) : undefined;

    return (
        <ModalOverlay onClose={handleCloseModal} zIndex="z-50" className="p-2 sm:p-4">
            <div className="relative flex max-h-[min(94dvh,900px)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card lg:max-w-6xl">
                {isPaying && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center /60 backdrop-blur-sm transition-opacity duration-200">
                        <div className="flex flex-col items-center rounded-xl p-6 shadow-xl bg-card border border-border max-w-xs text-center">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
                            <h3 className="text-sm font-bold text-foreground mb-1">
                                Mali İşlem Yapılıyor
                            </h3>
                            <p className="text-2xs text-muted-foreground animate-pulse">
                                Fiş düzenleniyor ve ödeme kaydediliyor. Lütfen bekleyin...
                            </p>
                        </div>
                    </div>
                )}

                <OrderModalHeader
                    tableName={tableName}
                    isTransferring={isTransferring}
                    setIsTransferring={setIsTransferring}
                    hasActiveOrders={hasActiveOrders}
                    orderId={orderId}
                    onNewOrder={onNewOrder}
                    onClose={handleCloseModal}
                    fetchAllTables={fetchAllTables}
                    canManageTakeaway={canManageTakeaway}
                    isHistoricalSaleView={isHistoricalSaleView}
                    saleId={sale?.id}
                    onReprintKitchen={handleReprintKitchen}
                    onReprintOrder={handleReprintOrder}
                    isReprinting={isReprinting}
                />

                {isTransferring ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <TableTransferView
                            tableName={tableName}
                            searchTable={searchTable}
                            setSearchTable={setSearchTable}
                            allTables={allTables}
                            tableId={tableId}
                            isTransferLoading={isTransferLoading}
                            handleTransferTable={handleTransferTable}
                        />
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={22} className="animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="py-8 text-center text-sm text-rose-500">
                        {extractApiError(error, t('errorLoading'))}
                    </div>
                ) : (
                    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
                        {/* Sol Sütun: Sipariş Kalemleri (scroll) + Alt Sabit Özet */}
                        <div className="flex min-h-0 flex-col border-r-0 lg:border-r border-border">
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                                <OrderItemsList
                                    orders={orders}
                                    isCancelling={isCancelling}
                                    isUpdatingItem={isUpdatingItem}
                                    handleCancelOrder={(id, idx) => setConfirmCancel({ type: 'ORDER', id, name: t('orderNum', { num: idx + 1 }) })}
                                    handleCancelOrderItem={(id, name) => setConfirmCancel({ type: 'ITEM', id, name })}
                                    handleUpdateItemQuantity={handleUpdateItemQuantity}
                                    readOnly={isHistoricalSaleView}
                                    hideDeliveredQuantityControls={hideDeliveredQuantityControls}
                                    handleSingleOrderPayment={handleSingleOrderPayment}
                                    isPaying={isPaying}
                                />
                            </div>
                            {hasActiveOrders && (
                                <div className="shrink-0 border-t border-border px-4 py-4">
                                    <OrderFooter
                                        mode="summary"
                                        orders={orders}
                                        totalOrderDiscount={totalOrderDiscount}
                                        subtotalBeforeOrderDiscount={subtotalBeforeOrderDiscount}
                                        grandTotal={grandTotal}
                                        paymentMethod={paymentMethod}
                                        setPaymentMethod={setPaymentMethod}
                                        handlePayment={handlePayment}
                                        isPaying={isPaying}
                                        isLoading={isLoading}
                                        payError={payError}
                                        readOnly={isHistoricalSaleView}
                                        allowSplitPayment={orders.length > 0}
                                        useSplitPayment={useSplitPayment}
                                        onToggleSplit={(v) => setUseSplitPayment(v)}
                                        splitAmounts={splitAmounts}
                                        onSplitAmountChange={(m, v) =>
                                            setSplitAmounts((prev) => ({ ...prev, [m]: v }))
                                        }
                                        onCreditClick={() => setShowCreditModal(true)}
                                        creditAccountName={creditAccountName}
                                        isCreditSelected={isCreditSelected}
                                        onCancelAll={props.tableId ? () => setConfirmCancel({ type: 'TABLE_ALL', id: props.tableId! }) : undefined}
                                        isCancelling={!!isCancelling}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Sağ Sütun: Satış Detayı + İndirim (scroll) + Alt Sabit Ödeme Kontrolleri */}
                        <div className="flex min-h-0 flex-col">
                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                                <div className="space-y-4 p-4 pb-0">
                                    {!isHistoricalSaleView && orders.length > 0 && (
                                        <div className="rounded-xl border border-border /50 p-3.5 bg-card/40 border-border">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <Users size={16} className="text-muted-foreground" />
                                                    <div className="min-w-0">
                                                        <span className="text-2xs font-semibold text-muted-foreground tracking-widerblock">
                                                            Müşteri Bilgisi
                                                        </span>
                                                        <span className="text-xs font-bold text-foreground truncate block">
                                                            {orders[0]?.customer_name || "Müşteri Seçilmedi"}
                                                        </span>
                                                    </div>
                                                </div>
                                                {orders[0]?.customer ? (
                                                    <div className="flex gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowCustomerSelect(true)}
                                                            className="text-2xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
                                                        >
                                                            Değiştir
                                                        </button>
                                                        <span className="text-muted-foreground text-xs">|</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectCustomer(null)}
                                                            className="text-2xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                                                        >
                                                            Kaldır
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCustomerSelect(true)}
                                                        className="text-2xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg dark:bg-blue-950/30 dark:text-blue-400 transition-colors shrink-0"
                                                    >
                                                        Müşteri Seç
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {!isHistoricalSaleView && canRenderSurveyButton && (
                                        <div className="flex justify-end">
                                            {saleActionSlot}
                                        </div>
                                    )}

                                    {sale && isHistoricalSaleView && (
                                        <SaleDetailView
                                            sale={sale}
                                            grandTotal={grandTotal}
                                            hasSaleChanges={hasSaleChanges}
                                            variant="full"
                                            actionSlot={saleActionSlot}
                                        />
                                    )}
                                    {sale && !isHistoricalSaleView && hasSaleChanges && (
                                        <SaleDetailView
                                            sale={sale}
                                            grandTotal={grandTotal}
                                            hasSaleChanges={hasSaleChanges}
                                            variant="changes"
                                        />
                                    )}

                                    {!isHistoricalSaleView && onPaymentComplete !== undefined && canApplyDiscount && (
                                        <DiscountPanel
                                            showDiscountPanel={showDiscountPanel}
                                            setShowDiscountPanel={setShowDiscountPanel}
                                            discountType={discountType}
                                            setDiscountType={setDiscountType}
                                            discountAmount={discountAmount}
                                            setDiscountAmount={setDiscountAmount}
                                            discountOrderId={discountOrderId}
                                            setDiscountOrderId={setDiscountOrderId}
                                            discountItemId={discountItemId}
                                            setDiscountItemId={setDiscountItemId}
                                            isApplyingDiscount={isApplyingDiscount}
                                            discountError={discountError}
                                            setDiscountError={setDiscountError}
                                            applyDiscount={applyDiscount}
                                            handleRemoveDiscount={handleRemoveDiscount}
                                            orders={orders}
                                        />
                                    )}

                                    {cashPanelVisible && !isHistoricalSaleView && onPaymentComplete !== undefined && (
                                        <CashChangePanel
                                            cashGiven={cashGiven}
                                            setCashGiven={setCashGiven}
                                            cashTarget={cashTarget}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="shrink-0 border-t border-border p-4">
                                <OrderFooter
                                    mode="payment"
                                    orders={orders}
                                    totalOrderDiscount={totalOrderDiscount}
                                    subtotalBeforeOrderDiscount={subtotalBeforeOrderDiscount}
                                    grandTotal={grandTotal}
                                    paymentMethod={paymentMethod}
                                    setPaymentMethod={setPaymentMethod}
                                    handlePayment={handlePayment}
                                    isPaying={isPaying}
                                    isLoading={isLoading}
                                    payError={payError}
                                    readOnly={isHistoricalSaleView}
                                    allowSplitPayment={orders.length > 0}
                                    useSplitPayment={useSplitPayment}
                                    onToggleSplit={(v) => setUseSplitPayment(v)}
                                    splitAmounts={splitAmounts}
                                    onSplitAmountChange={(m, v) =>
                                        setSplitAmounts((prev) => ({ ...prev, [m]: v }))
                                    }
                                    onCreditClick={() => setShowCreditModal(true)}
                                    creditAccountName={creditAccountName}
                                    isCreditSelected={isCreditSelected}
                                    onCancelAll={props.tableId ? () => setConfirmCancel({ type: 'TABLE_ALL', id: props.tableId! }) : undefined}
                                    isCancelling={!!isCancelling}
                                />
                            </div>
                        </div>
                    </div>
                )}

            </div>
            <CancelConfirmationDialog
                confirmCancel={confirmCancel}
                setConfirmCancel={setConfirmCancel}
                processCancellation={processCancellation}
            />

            <KitchenResendConfirmationDialog
                confirmKitchenResend={confirmKitchenResend}
                setConfirmKitchenResend={setConfirmKitchenResend}
                onConfirm={confirmKitchenResendUpdate}
                isUpdatingItem={isUpdatingItem}
            />

            <SaleReceiptPrintDialog
                open={showSalePrintDialog}
                onOpenChange={setShowSalePrintDialog}
                branchId={salePrintBranchId}
                onConfirm={handleSalePrintConfirm}
                isSubmitting={isReprinting}
            />

            {activeBranchId && (
                <CreditPaymentModal
                    open={showCreditModal}
                    branchId={activeBranchId}
                    onClose={() => setShowCreditModal(false)}
                    onSelect={selectCreditAccount}
                />
            )}

            {showCustomerSelect && (
                <CustomerSelectModal
                    onClose={() => setShowCustomerSelect(false)}
                    onSelect={(customer) => {
                        void handleSelectCustomer(customer.id);
                        setShowCustomerSelect(false);
                    }}
                />
            )}

            <AlertDialog open={!!stockWarning} onOpenChange={open => !open && setStockWarning(null)}>
                <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('insufficientStock')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {stockWarning?.message}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPaying}>{t('dismiss')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void stockWarning?.onConfirm();
                            }}
                            disabled={isPaying}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                            {isPaying && <Loader2 size={14} className="animate-spin mr-1.5" />}
                            {t('confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ModalOverlay>
    );
}
