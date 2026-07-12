import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import api, { skipInterceptorToast } from '@/lib/api';
import { toastApiError, extractApiError } from '@/lib/operationalToast';
import { formatCurrency } from '@/lib/formatters';
import { usePosStore } from "@/store/usePosStore";
import { usePosBranches } from "@/features/pos/hooks/usePosBranches";
import {
  shouldSyncPosCustomerDisplay,
  signalPosCustomerDisplaySuccess,
} from "@/features/pos/lib/posCustomerDisplaySync";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/store/useAuthStore";
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { PAYMENT_METHODS } from './constants';
import type { OrderDetail, SaleDetail, PaymentMethod, TableOrderModalProps, ConfirmCancelState, ConfirmKitchenResendState } from './types';
import type { Table } from '@/features/tables/types/table.types';
import type { SplitAmountsState } from './OrderFooter';
import { defaultSplitAmounts } from './OrderFooter';
import { v4 as uuidv4 } from "uuid";
import { usePosConnectivity } from "@/features/pos/offline/connectivity";
import { executeOrEnqueue } from "@/features/pos/offline/executeOrEnqueue";
import { dispatchReceiptPrints } from "@/features/pos/lib/dispatchReceiptPrints";
import { buildKitchenReprintJobsFromOrders } from "@/features/pos/lib/buildKitchenReprintJobsFromOrders";
import { buildPrintJobIdempotencyKey } from "@/features/pos/lib/printIdempotency";
import { receiptLineFromOrderItem } from "@/lib/receiptOrderItems";
import { buildReceiptDateTimeContext } from "@/lib/receiptDateContext";
import { adminApi, type Printer } from "@/features/admin/services/adminApi";

import { isActiveOrderStatus } from '@/features/orders/constants/activeOrderStatuses';
import { getEffectiveOrderItemQuantity } from '@/features/orders/utils/orderItemQuantity';

/** POS sipariş fişi: backend `_order_items_for_print` ile uyumlu — iptal hariç, teslim edilmiş kalemler dahil. */
const ORDER_RECEIPT_ITEM_STATUSES = new Set([
    'PENDING',
    'PREPARING',
    'READY',
    'DELIVERED',
]);

function isPrintableOrderItem(
    item: { status: string; parent_item?: string | null },
    historical: boolean,
): boolean {
    if (item.status === 'CANCELLED') return false;
    // Birleşik ürün alt kalemleri fişte ayrı satır olarak basılmaz (yalnızca parent).
    if (item.parent_item) return false;
    if (historical) return true;
    return ORDER_RECEIPT_ITEM_STATUSES.has(item.status);
}

function customerNameFromOrders(orders: OrderDetail[]): string | undefined {
    for (const order of orders) {
        const name = order.customer_name?.trim();
        if (name) return name;
    }
    return undefined;
}

function buildPaymentLabelForReceipt(
    useSplitPayment: boolean,
    splitAmounts: SplitAmountsState,
    paymentMethod: PaymentMethod,
    paymentLabelFor: (m: PaymentMethod) => string,
): string {
    if (useSplitPayment) {
        const parts: string[] = [];
        for (const m of PAYMENT_METHODS) {
            const raw = (splitAmounts[m.value] ?? '').trim();
            if (!raw) continue;
            const n = parseFloat(raw);
            if (!Number.isFinite(n) || n <= 0) continue;
            parts.push(`${paymentLabelFor(m.value)}: ${formatCurrency(n)}`);
        }
        if (parts.length > 0) return parts.join('\n');
    }
    return paymentLabelFor(paymentMethod);
}

export function useTableOrderModal({
    tableId,
    orderId,
    tableName,
    onClose,
    onPaymentComplete,
    onActiveOrdersChanged,
    initialTransferMode,
}: TableOrderModalProps) {
    const t = useTranslations('tables.orderModal');
    const tMessages = useTranslations('tables.messages');
    const tPos = useTranslations('pos');
    const tPrintErr = useTranslations('pos.errors');
    const { canManage } = useModulePermissions();
    const canApplyDiscount = canManage('pos.apply_discount');
    const canManageTakeaway = canManage('takeaway.manage_takeaway');

    // Data Fetching
    const { data: activeOrders = [], refetch: refreshOrders, isLoading: isOrdersLoading, error: activeOrdersError } = useQuery({
        queryKey: ['table-orders', tableId],
        queryFn: async () => {
            if (!tableId) return [];
            const res = await api.get<{ results?: OrderDetail[] }>(`/orders/main/`, {
                params: { table_id: tableId, ordering: 'created_at' },
            });
            const all = (res.data.results ?? res.data) as OrderDetail[];
            const active = all.filter(o => isActiveOrderStatus(o.status));
            
            if (shouldSyncPosCustomerDisplay()) {
              usePosStore.getState().setActiveDisplayOrder(active);
            }
            
            if (active.length === 0 && !isOrdersLoading) {
                onPaymentComplete?.();
                onClose();
            }
            return active;
        },
        enabled: !!tableId && !orderId,
        staleTime: 0,
    });

    const { data: historicalOrder, isLoading: isHistoricalLoading, error: historicalOrderError } = useQuery({
        queryKey: ['historical-order', orderId],
        queryFn: async () => {
            const [orderRes, saleRes] = await Promise.all([
                api.get<OrderDetail>(`/orders/main/${orderId}/`),
                api.get<{ results?: SaleDetail[] } | SaleDetail[]>(`/sales/`, { params: { order: orderId } }).catch(() => null),
            ]);
            
            let saleObj: SaleDetail | null = null;
            if (saleRes) {
                const data = saleRes.data;
                const list: SaleDetail[] = Array.isArray(data)
                    ? data
                    : ((data as { results?: SaleDetail[] }).results ?? []);
                if (list.length > 0) saleObj = list[0];
            }
            return { order: orderRes.data, sale: saleObj };
        },
        enabled: !!orderId,
    });

    const orders = useMemo(
        () => (orderId ? (historicalOrder ? [historicalOrder.order] : []) : activeOrders),
        [orderId, historicalOrder, activeOrders],
    );
    const sale = historicalOrder?.sale || null;
    const isLoading = orderId ? isHistoricalLoading : isOrdersLoading;
    const error = orderId ? historicalOrderError : activeOrdersError;

    // State
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
    const [creditAccountId, setCreditAccountId] = useState<string | null>(null);
    const [creditAccountName, setCreditAccountName] = useState<string | null>(null);
    const [showCreditModal, setShowCreditModal] = useState(false);
    const [useSplitPayment, setUseSplitPayment] = useState(false);
    const [splitAmounts, setSplitAmounts] = useState<SplitAmountsState>(defaultSplitAmounts);
    const [isPaying, setIsPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState<string | null>(null);
    const [isUpdatingItem, setIsUpdatingItem] = useState<string | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<ConfirmCancelState | null>(null);
    const [confirmKitchenResend, setConfirmKitchenResend] = useState<ConfirmKitchenResendState | null>(null);
    const [stockWarning, setStockWarning] = useState<{ message: string; onConfirm: () => void } | null>(null);
    
    // Table Transfer
    const [isTransferring, setIsTransferring] = useState(initialTransferMode || false);
    const [allTables, setAllTables] = useState<Table[]>([]);
    const [isTransferLoading, setIsTransferLoading] = useState(false);
    const [searchTable, setSearchTable] = useState('');

    // Discount
    const [showDiscountPanel, setShowDiscountPanel] = useState(false);
    const [discountType, setDiscountType] = useState<'ORDER' | 'ITEM'>('ORDER');
    const [discountAmount, setDiscountAmount] = useState('');
    const [discountOrderId, setDiscountOrderId] = useState('');
    const [discountItemId, setDiscountItemId] = useState('');
    const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
    const [discountError, setDiscountError] = useState<string | null>(null);
    const [cashGiven, setCashGiven] = useState('');
    const [isReprinting, setIsReprinting] = useState(false);
    const [showSalePrintDialog, setShowSalePrintDialog] = useState(false);
    const paymentOpIdRef = useRef<string | null>(null);

    const { data: branches = [] } = usePosBranches();
    const { activeBranchId, setDisplayMetadata, paymentPrinters, autoPrintPayment, posTerminalUuid } = usePosStore(useShallow((s) => ({
        activeBranchId: s.activeBranchId,
        setDisplayMetadata: s.setDisplayMetadata,
        paymentPrinters: s.paymentPrinters,
        autoPrintPayment: s.autoPrintPayment,
        posTerminalUuid: s.posTerminalUuid,
    })));

    const user = useAuthStore((s) => s.user);
    const { offlineMode } = usePosConnectivity();
    const tOffline = useTranslations("pos.offlineQueue");

    const paymentLabelFor = useCallback(
        (m: PaymentMethod) =>
            m === 'CREDIT'
                ? tPos('payment.credit')
                : tPos(`payment.${m.toLowerCase() as 'cash' | 'card' | 'other'}`),
        [tPos],
    );

    const setPaymentMethodSafe = useCallback((m: PaymentMethod) => {
        setPaymentMethod(m);
        setCreditAccountId(null);
        setCreditAccountName(null);
    }, []);

    const selectCreditAccount = useCallback((account: { id: string; full_name: string }) => {
        setPaymentMethod('CREDIT');
        setCreditAccountId(account.id);
        setCreditAccountName(account.full_name);
        setUseSplitPayment(false);
    }, []);

    // Sync state with store (yalnızca POS müşteri ekranı)
    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        usePosStore.getState().setDisplayMetadata({ isPaymentMode: true, paymentMethod });
        return () => {
            usePosStore.getState().setActiveDisplayOrder(null);
            usePosStore.getState().setDisplayMetadata({ isPaymentMode: false, paymentMethod: null, isProcessing: false });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        setDisplayMetadata({ paymentMethod });
    }, [paymentMethod, setDisplayMetadata]);

    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        setDisplayMetadata({ isProcessing: isPaying });
    }, [isPaying, setDisplayMetadata]);

    useEffect(() => {
        setUseSplitPayment(false);
        setSplitAmounts(defaultSplitAmounts());
        setCashGiven('');
        paymentOpIdRef.current = null;
    }, [tableId, orderId]);

    // Computed
    const grandTotal = useMemo(() => orders.reduce((sum, o) => sum + Number(o.total_amount), 0), [orders]);
    const totalOrderDiscount = useMemo(() => orders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0), [orders]);
    const subtotalBeforeOrderDiscount = useMemo(() => grandTotal + totalOrderDiscount, [grandTotal, totalOrderDiscount]);
    const hasActiveOrders = orders.length > 0;
    const isHistoricalSaleView = Boolean(orderId && !tableId);
    const salePrintBranchId = orders[0]?.branch || activeBranchId || branches[0]?.id;
    const hasSaleChanges = Boolean(
        sale &&
            (Number(sale.total_amount) !== grandTotal ||
                sale.notes.trim() !== '' ||
                (!!sale.original_payment_method && sale.payment_method !== sale.original_payment_method)),
    );
    const receiptCustomerName = useMemo(() => customerNameFromOrders(orders), [orders]);

    // Handlers
    const buildSplitLines = useCallback((): { method: string; amount: string }[] | undefined | 'INVALID' => {
        if (!useSplitPayment || orders.length === 0) return undefined;
        const lines: { method: PaymentMethod; amount: string }[] = [];
        for (const m of PAYMENT_METHODS) {
            const raw = splitAmounts[m.value].trim();
            if (!raw) continue;
            const n = parseFloat(raw);
            if (!Number.isFinite(n) || n <= 0) continue;
            lines.push({ method: m.value, amount: n.toFixed(4) });
        }
        if (lines.length < 2) {
            setPayError(t('errors.splitMinMethods'));
            return 'INVALID';
        }
        const sum = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
        if (Math.abs(sum - grandTotal) > 0.009) {
            setPayError(t('errors.splitSumMismatch', { total: formatCurrency(grandTotal) }));
            return 'INVALID';
        }
        return lines;
    }, [useSplitPayment, orders, splitAmounts, grandTotal, t]);

    const resolvePaymentPayload = useCallback((): {
        primaryMethod: PaymentMethod;
        payments?: Array<{ method: string; amount: string; credit_account_id?: string }>;
    } | 'INVALID' => {
        const splitLines = buildSplitLines();
        if (splitLines === 'INVALID') return 'INVALID';
        if (splitLines) {
            return { primaryMethod: splitLines[0].method as PaymentMethod, payments: splitLines };
        }
        if (paymentMethod === 'CREDIT') {
            if (!creditAccountId) {
                setPayError(t('errors.creditAccountRequired'));
                return 'INVALID';
            }
            return {
                primaryMethod: 'CREDIT',
                payments: [{
                    method: 'CREDIT',
                    amount: grandTotal.toFixed(4),
                    credit_account_id: creditAccountId,
                }],
            };
        }
        return { primaryMethod: paymentMethod };
    }, [buildSplitLines, paymentMethod, creditAccountId, grandTotal, t]);

    const dispatchPaymentReceiptPrints = useCallback((
        printContext: {
            orderNumber: string;
            items: Array<{
                name: string;
                qty: number;
                price: number;
                unit: string;
                tax_rate?: number;
                notes?: string;
            }>;
            subtotal: number;
            discount: number;
            total: number;
            branchName: string;
            paymentLabel: string;
            paymentsData: Array<{ method: string; amount: number } | null>;
            idempotencyPrefix: string;
            orderId?: string;
            saleId?: string;
        },
        options?: { showSuccessToast?: boolean }
    ) => {
        if (!autoPrintPayment || paymentPrinters.length === 0) return;

        const jobs = paymentPrinters
            .filter((job) => job.printerId && job.templateSlug)
            .map((job) => ({
                templateSlug: job.templateSlug,
                printerId: job.printerId,
                context: {
                    order_number: printContext.orderNumber,
                    table_name: tableName || "Masa",
                    waiter_name: user?.username || "Garson",
                    items: printContext.items,
                    subtotal: printContext.subtotal,
                    discount: printContext.discount,
                    total: printContext.total,
                    branch_name: printContext.branchName,
                    payment_method: printContext.paymentLabel,
                    payment_type: printContext.paymentLabel,
                    payments: printContext.paymentsData,
                    created_at: new Date().toLocaleString("tr-TR"),
                    ...(printContext.orderId ? { order_id: printContext.orderId } : {}),
                    ...(printContext.saleId ? { sale_id: printContext.saleId } : {}),
                    ...(receiptCustomerName ? { customer_name: receiptCustomerName } : {}),
                },
                idempotencyKey: buildPrintJobIdempotencyKey(
                    printContext.idempotencyPrefix,
                    job.printerId,
                    job.templateSlug
                ),
            }));

        void dispatchReceiptPrints(jobs, {
            getPrinterErrorMessage: (id) => tPrintErr("printerQueue", { id }),
            successMessage: options?.showSuccessToast === false ? undefined : t("messages.receiptsQueued"),
            partialSuccessMessage: ({ succeeded, failed, total }) =>
                t("messages.receiptsQueuedPartial", { succeeded, failed, total }),
        });
    }, [autoPrintPayment, paymentPrinters, tableName, user, t, tPrintErr, receiptCustomerName]);

    const triggerReceiptPrint = useCallback(() => {
        if (!autoPrintPayment || paymentPrinters.length === 0 || orders.length === 0) return;

        const branchId = activeBranchId || branches[0]?.id;
        const branchName = branches.find(b => b.id === branchId)?.name || "Şube";

        const allItems = orders.flatMap(o => o.items.map(receiptLineFromOrderItem));

        const idemBase = orders
            .map((o) => o.id)
            .sort()
            .join("|");

        const paymentLabel = buildPaymentLabelForReceipt(
            useSplitPayment,
            splitAmounts,
            paymentMethod,
            paymentLabelFor,
        );

        const paymentsData = useSplitPayment
          ? PAYMENT_METHODS.map(m => {
              const amount = parseFloat(splitAmounts[m.value] || '0');
              if (amount > 0) return { method: paymentLabelFor(m.value), amount };
              return null;
            }).filter(Boolean)
          : [{ method: paymentLabelFor(paymentMethod), amount: grandTotal }];

        dispatchPaymentReceiptPrints({
            orderNumber: orders.map((o) => o.order_number).filter(Boolean).join(", ") || "MASA",
            items: allItems,
            subtotal: subtotalBeforeOrderDiscount,
            discount: totalOrderDiscount,
            total: grandTotal,
            branchName,
            paymentLabel,
            paymentsData,
            idempotencyPrefix: idemBase ? `pay:${idemBase}` : `pay:${uuidv4()}`,
            orderId: orders.length === 1 ? orders[0]?.id : undefined,
        });
    }, [
        autoPrintPayment, paymentPrinters, orders, activeBranchId, branches, grandTotal,
        useSplitPayment, splitAmounts, paymentMethod, totalOrderDiscount, subtotalBeforeOrderDiscount,
        paymentLabelFor, dispatchPaymentReceiptPrints,
    ]);

    const handleReprintKitchen = useCallback(async () => {
        if (orders.length === 0 || isReprinting) return;

        const branchId = activeBranchId || orders[0]?.branch || branches[0]?.id;
        if (!branchId) {
            toast.warning(t("printNoBranch"));
            return;
        }

        setIsReprinting(true);
        try {
            const printerData = await adminApi.getPrinters({
                branch_id: branchId,
                usage_type: "KITCHEN",
                is_active: true,
            });
            const kitchenPrinters: Printer[] =
                "results" in printerData
                    ? (printerData.results as Printer[])
                    : (printerData as unknown as Printer[]);

            if (!kitchenPrinters.length) {
                toast.warning(t("printNoKitchenPrinters"));
                return;
            }

            const branchName = branches.find((b) => b.id === branchId)?.name || "Şube";
            const reprintToken = uuidv4();
            const jobs = buildKitchenReprintJobsFromOrders({
                orders,
                kitchenPrinters,
                baseContext: {
                    table_name: tableName || "Masa",
                    waiter_name: user?.username || "Garson",
                    branch_name: branchName,
                    created_at: new Date().toLocaleString("tr-TR"),
                },
                reprintToken,
            });

            if (!jobs.length) {
                toast.warning(t("printNoKitchenJobs"));
                return;
            }

            await dispatchReceiptPrints(jobs, {
                getPrinterErrorMessage: (id) => tPrintErr("printerQueue", { id }),
                successMessage: t("messages.kitchenReceiptsQueued"),
                partialSuccessMessage: ({ succeeded, failed, total }) =>
                    t("messages.kitchenReceiptsQueuedPartial", { succeeded, failed, total }),
            });
        } catch (err) {
            toastApiError(err, t("printKitchenFailed"));
        } finally {
            setIsReprinting(false);
        }
    }, [
        orders,
        isReprinting,
        activeBranchId,
        branches,
        tableName,
        user,
        t,
        tPrintErr,
    ]);

    const dispatchOrderReceiptPrints = useCallback(async (
        printerConfigs: Array<{ printerId: string; templateSlug: string }>,
    ) => {
        if (!printerConfigs.length || orders.length === 0) return;

        const branchId = orders[0]?.branch || activeBranchId || branches[0]?.id;
        const branchName = branches.find((b) => b.id === branchId)?.name || "Şube";
        const allItems = orders.flatMap((o) =>
            o.items
                .filter((item) => isPrintableOrderItem(item, isHistoricalSaleView))
                .map(receiptLineFromOrderItem),
        );

        const canBackendEnrichItems = orders.length === 1 && Boolean(orders[0]?.id);
        if (!allItems.length && !canBackendEnrichItems) {
            toast.warning(t("printNoOrderItems"));
            return;
        }

        const idemBase = `reprint:${uuidv4()}:${orders
            .map((o) => o.id)
            .sort()
            .join("|")}`;

        const receiptSubtotal = isHistoricalSaleView && sale
            ? Number(sale.total_amount) + Number(sale.discount_amount || 0)
            : subtotalBeforeOrderDiscount;
        const receiptDiscount = isHistoricalSaleView && sale
            ? Number(sale.discount_amount || 0)
            : totalOrderDiscount;
        const receiptTotal = isHistoricalSaleView && sale
            ? Number(sale.total_amount)
            : grandTotal;

        let paymentLabel = t("printOrderReceiptPending");
        let paymentsData: Array<{ method: string; amount: number }> = [
            { method: paymentLabel, amount: receiptTotal },
        ];

        if (isHistoricalSaleView && sale) {
            if (sale.is_split_payment && sale.payments?.length) {
                paymentLabel = sale.payments
                    .map((p) => `${p.payment_method_display}: ${formatCurrency(Number(p.amount))}`)
                    .join("\n");
                paymentsData = sale.payments.map((p) => ({
                    method: p.payment_method_display,
                    amount: Number(p.amount),
                }));
            } else {
                paymentLabel = sale.payment_method_display;
                paymentsData = [{ method: sale.payment_method_display, amount: receiptTotal }];
            }
        }

        const receiptDateTime = isHistoricalSaleView
            ? buildReceiptDateTimeContext(sale?.paid_at ?? orders[0]?.created_at)
            : buildReceiptDateTimeContext(new Date().toISOString());

        const jobs = printerConfigs.map((job) => ({
            templateSlug: job.templateSlug,
            printerId: job.printerId,
            context: {
                order_number:
                    orders.map((o) => o.order_number).filter(Boolean).join(", ") || "MASA",
                table_name: tableName || orders[0]?.table_name || "Masa",
                waiter_name: (isHistoricalSaleView && sale?.created_by_name) || user?.username || "Garson",
                items: allItems,
                subtotal: receiptSubtotal,
                discount: receiptDiscount,
                total: receiptTotal,
                branch_name: branchName,
                payment_method: paymentLabel,
                payment_type: paymentLabel,
                payments: paymentsData,
                ...receiptDateTime,
                ...(orders.length === 1 ? { order_id: orders[0]?.id } : {}),
                ...(sale?.id ? { sale_id: sale.id } : {}),
                ...(receiptCustomerName ? { customer_name: receiptCustomerName } : {}),
            },
            idempotencyKey: buildPrintJobIdempotencyKey(
                idemBase,
                job.printerId,
                job.templateSlug,
            ),
        }));

        await dispatchReceiptPrints(jobs, {
            getPrinterErrorMessage: (id) => tPrintErr("printerQueue", { id }),
            successMessage: t("messages.orderReceiptsQueued"),
            partialSuccessMessage: ({ succeeded, failed, total }) =>
                t("messages.orderReceiptsQueuedPartial", { succeeded, failed, total }),
        });
    }, [
        orders,
        activeBranchId,
        branches,
        tableName,
        user,
        subtotalBeforeOrderDiscount,
        totalOrderDiscount,
        grandTotal,
        isHistoricalSaleView,
        sale,
        t,
        tPrintErr,
        receiptCustomerName,
    ]);

    const handleReprintOrder = useCallback(async () => {
        if (orders.length === 0 || isReprinting) return;

        if (isHistoricalSaleView) {
            if (!salePrintBranchId) {
                toast.warning(t("printNoBranch"));
                return;
            }
            setShowSalePrintDialog(true);
            return;
        }

        const configured = paymentPrinters.filter((job) => job.printerId && job.templateSlug);
        if (!configured.length) {
            toast.warning(t("printNoOrderPrinters"));
            return;
        }

        setIsReprinting(true);
        try {
            await dispatchOrderReceiptPrints(configured);
        } catch (err) {
            toastApiError(err, t("printOrderFailed"));
        } finally {
            setIsReprinting(false);
        }
    }, [
        orders,
        isReprinting,
        isHistoricalSaleView,
        salePrintBranchId,
        paymentPrinters,
        dispatchOrderReceiptPrints,
        t,
    ]);

    const handleSalePrintConfirm = useCallback(async (selection: { printerId: string; templateSlug: string }) => {
        if (isReprinting) return;
        setIsReprinting(true);
        try {
            await dispatchOrderReceiptPrints([selection]);
            setShowSalePrintDialog(false);
        } catch (err) {
            toastApiError(err, t("printOrderFailed"));
        } finally {
            setIsReprinting(false);
        }
    }, [isReprinting, dispatchOrderReceiptPrints, t]);

    const verifyPaymentSettled = useCallback(async (): Promise<boolean> => {
        try {
            if (orderId) {
                const res = await api.get<OrderDetail>(`/orders/main/${orderId}/`, skipInterceptorToast);
                return res.data.status === 'COMPLETED';
            }
            if (!tableId) return false;
            const res = await api.get<{ results?: OrderDetail[] }>(`/orders/main/`, {
                params: { table_id: tableId, ordering: 'created_at' },
                ...skipInterceptorToast,
            });
            const all = (res.data.results ?? res.data) as OrderDetail[];
            const active = all.filter(o => isActiveOrderStatus(o.status));
            return active.length === 0;
        } catch {
            return false;
        }
    }, [orderId, tableId]);

    const finalizePaymentSuccess = useCallback(() => {
        paymentOpIdRef.current = null;
        triggerReceiptPrint();
        signalPosCustomerDisplaySuccess('PAYMENT');
        onPaymentComplete?.();
        onClose();
    }, [triggerReceiptPrint, onPaymentComplete, onClose]);

    const handlePayment = useCallback(async () => {
        if (isPaying) return;
        setIsPaying(true);
        setPayError(null);
        try {
            const resolved = resolvePaymentPayload();
            if (resolved === 'INVALID') return;

            const primaryMethod = resolved.primaryMethod;
            const paymentLines = resolved.payments;
            if (!paymentOpIdRef.current) {
                paymentOpIdRef.current = uuidv4();
            }
            const clientOpId = paymentOpIdRef.current;
            const tableLabel = tableName || orders[0]?.table_name || "Masa";

            const enqueueOpts = { offlineMode, clientOpId, skipApiToast: true as const };

            const postComplete = async (body: Record<string, unknown>, allowNegative = false) => {
                const payload = allowNegative ? { ...body, allow_negative_stock: true } : body;
                if (orders.length === 1) {
                    return executeOrEnqueue({
                        ...enqueueOpts,
                        type: "COMPLETE_ORDER",
                        endpoint: `/orders/main/${orders[0].id}/complete/`,
                        payload,
                        branchId: activeBranchId || orders[0].branch || "",
                        label: tOffline("labels.completeOrder", { table: tableLabel }),
                    });
                }
                return executeOrEnqueue({
                    ...enqueueOpts,
                    type: "COMPLETE_TABLE",
                    endpoint: "/orders/main/complete_table/",
                    payload: {
                        table_id: tableId,
                        branch_id: activeBranchId,
                        ...payload,
                    },
                    branchId: activeBranchId || "",
                    label: tOffline("labels.completeTable", { table: tableLabel }),
                });
            };

            const body: Record<string, unknown> = {
                payment_method: primaryMethod,
                ...(paymentLines ? { payments: paymentLines } : {}),
                ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
            };

            const result = await postComplete(body);
            if (result.mode === "queued") {
                paymentOpIdRef.current = null;
                toast.success(tOffline("messages.queuedPayment"));
                signalPosCustomerDisplaySuccess('PAYMENT');
                onPaymentComplete?.();
                onClose();
                return;
            }

            finalizePaymentSuccess();
        } catch (err: unknown) {
            const status = isAxiosError(err) ? err.response?.status : undefined;
            const data = isAxiosError(err) ? err.response?.data as { code?: string; item_name?: string; available?: string; requested?: string } : undefined;
            if (status === 409 && data?.code === "INSUFFICIENT_STOCK") {
                const msg = t('errors.insufficientStock', {
                    name: data.item_name ?? "",
                    available: data.available ?? "",
                    requested: data.requested ?? "",
                });
                setStockWarning({
                    message: msg,
                    onConfirm: async () => {
                        try {
                            setIsPaying(true);
                            const resolved = resolvePaymentPayload();
                            if (resolved === 'INVALID') return;

                            const body: Record<string, unknown> = {
                                payment_method: resolved.primaryMethod,
                                allow_negative_stock: true,
                                ...(resolved.payments ? { payments: resolved.payments } : {}),
                                ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
                            };
                            const clientOpId = paymentOpIdRef.current ?? uuidv4();
                            paymentOpIdRef.current = clientOpId;
                            const tableLabel = tableName || orders[0]?.table_name || "Masa";
                            const enqueueOpts = { offlineMode, clientOpId, skipApiToast: true as const };
                            const postComplete = async () => {
                                if (orders.length === 1) {
                                    return executeOrEnqueue({
                                        ...enqueueOpts,
                                        type: "COMPLETE_ORDER",
                                        endpoint: `/orders/main/${orders[0].id}/complete/`,
                                        payload: body,
                                        branchId: activeBranchId || orders[0].branch || "",
                                        label: tOffline("labels.completeOrder", { table: tableLabel }),
                                    });
                                }
                                return executeOrEnqueue({
                                    ...enqueueOpts,
                                    type: "COMPLETE_TABLE",
                                    endpoint: "/orders/main/complete_table/",
                                    payload: {
                                        table_id: tableId,
                                        branch_id: activeBranchId,
                                        ...body,
                                    },
                                    branchId: activeBranchId || "",
                                    label: tOffline("labels.completeTable", { table: tableLabel }),
                                });
                            };
                            const result = await postComplete();
                            if (result.mode === "queued") {
                                paymentOpIdRef.current = null;
                                toast.success(tOffline("messages.queuedPayment"));
                                signalPosCustomerDisplaySuccess('PAYMENT');
                                onPaymentComplete?.();
                                onClose();
                                return;
                            }
                            finalizePaymentSuccess();
                        } catch (retryErr: unknown) {
                            if (await verifyPaymentSettled()) {
                                finalizePaymentSuccess();
                                return;
                            }
                            setPayError(extractApiError(retryErr, t('errors.paymentFailed')));
                        } finally {
                            setIsPaying(false);
                            setStockWarning(null);
                        }
                    }
                });
                return;
            }
            if (await verifyPaymentSettled()) {
                finalizePaymentSuccess();
                return;
            }
            setPayError(extractApiError(err, t('errors.paymentFailed')));
        } finally {
            setIsPaying(false);
        }
    }, [resolvePaymentPayload, orders, posTerminalUuid, tableId, activeBranchId, onPaymentComplete, onClose, offlineMode, tableName, t, tOffline, finalizePaymentSuccess, verifyPaymentSettled, isPaying]);

    const handleSingleOrderPayment = useCallback(async (targetOrderId: string, method: PaymentMethod) => {
        if (isPaying) return;
        setIsPaying(true);
        setPayError(null);
        try {
            if (!paymentOpIdRef.current) {
                paymentOpIdRef.current = uuidv4();
            }
            const clientOpId = paymentOpIdRef.current;
            const targetOrder = orders.find(o => o.id === targetOrderId);
            const tableLabel = tableName || targetOrder?.table_name || "Masa";

            const enqueueOpts = { offlineMode, clientOpId, skipApiToast: true as const };

            const body: Record<string, unknown> = {
                payment_method: method,
                ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
            };

            const result = await executeOrEnqueue({
                ...enqueueOpts,
                type: "COMPLETE_ORDER",
                endpoint: `/orders/main/${targetOrderId}/complete/`,
                payload: body,
                branchId: activeBranchId || targetOrder?.branch || "",
                label: tOffline("labels.completeOrder", { table: tableLabel }),
            });

            if (result.mode === "queued") {
                paymentOpIdRef.current = null;
                toast.success(tOffline("messages.queuedPayment"));
                signalPosCustomerDisplaySuccess('PAYMENT');
                void refreshOrders();
                onActiveOrdersChanged?.();
                return;
            }

            paymentOpIdRef.current = null;

            if (targetOrder) {
                const branchId = activeBranchId || branches[0]?.id;
                const branchName = branches.find(b => b.id === branchId)?.name || "Şube";
                dispatchPaymentReceiptPrints({
                    orderNumber: targetOrder.order_number || "Sipariş",
                    items: targetOrder.items.map(receiptLineFromOrderItem),
                    subtotal: Number(targetOrder.total_amount) + Number(targetOrder.discount_amount || 0),
                    discount: Number(targetOrder.discount_amount || 0),
                    total: Number(targetOrder.total_amount),
                    branchName,
                    paymentLabel: paymentLabelFor(method),
                    paymentsData: [{ method: paymentLabelFor(method), amount: Number(targetOrder.total_amount) }],
                    idempotencyPrefix: `pay:${targetOrderId}`,
                    orderId: targetOrderId,
                });
            }

            signalPosCustomerDisplaySuccess('PAYMENT');
            toast.success(tMessages('paymentSuccess') || 'Ödeme başarıyla alındı.');
            await refreshOrders();
            onActiveOrdersChanged?.();
        } catch (err: unknown) {
            const status = isAxiosError(err) ? err.response?.status : undefined;
            const data = isAxiosError(err) ? err.response?.data as { code?: string; item_name?: string; available?: string; requested?: string } : undefined;
            if (status === 409 && data?.code === "INSUFFICIENT_STOCK") {
                const msg = t('errors.insufficientStock', {
                    name: data.item_name ?? "",
                    available: data.available ?? "",
                    requested: data.requested ?? "",
                });
                setStockWarning({
                    message: msg,
                    onConfirm: async () => {
                        try {
                            setIsPaying(true);
                            const body: Record<string, unknown> = {
                                payment_method: method,
                                allow_negative_stock: true,
                                ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
                            };
                            const clientOpId = paymentOpIdRef.current ?? uuidv4();
                            paymentOpIdRef.current = clientOpId;
                            const targetOrder = orders.find(o => o.id === targetOrderId);
                            const tableLabel = tableName || targetOrder?.table_name || "Masa";
                            const enqueueOpts = { offlineMode, clientOpId, skipApiToast: true as const };

                            const result = await executeOrEnqueue({
                                ...enqueueOpts,
                                type: "COMPLETE_ORDER",
                                endpoint: `/orders/main/${targetOrderId}/complete/`,
                                payload: body,
                                branchId: activeBranchId || targetOrder?.branch || "",
                                label: tOffline("labels.completeOrder", { table: tableLabel }),
                            });

                            if (result.mode === "queued") {
                                paymentOpIdRef.current = null;
                                toast.success(tOffline("messages.queuedPayment"));
                                signalPosCustomerDisplaySuccess('PAYMENT');
                                void refreshOrders();
                                onActiveOrdersChanged?.();
                                return;
                            }

                            paymentOpIdRef.current = null;
                            if (targetOrder) {
                                const branchId = activeBranchId || branches[0]?.id;
                                const branchName = branches.find(b => b.id === branchId)?.name || "Şube";
                                dispatchPaymentReceiptPrints({
                                    orderNumber: targetOrder.order_number || "Sipariş",
                                    items: targetOrder.items.map(receiptLineFromOrderItem),
                                    subtotal: Number(targetOrder.total_amount) + Number(targetOrder.discount_amount || 0),
                                    discount: Number(targetOrder.discount_amount || 0),
                                    total: Number(targetOrder.total_amount),
                                    branchName,
                                    paymentLabel: paymentLabelFor(method),
                                    paymentsData: [{ method: paymentLabelFor(method), amount: Number(targetOrder.total_amount) }],
                                    idempotencyPrefix: `pay:${targetOrderId}`,
                                    orderId: targetOrderId,
                                }, { showSuccessToast: false });
                            }
                            signalPosCustomerDisplaySuccess('PAYMENT');
                            toast.success(tMessages('paymentSuccess') || 'Ödeme başarıyla alındı.');
                            await refreshOrders();
                            onActiveOrdersChanged?.();
                        } catch (retryErr: unknown) {
                            setPayError(extractApiError(retryErr, t('errors.paymentFailed')));
                        } finally {
                            setIsPaying(false);
                            setStockWarning(null);
                        }
                    }
                });
                return;
            }
            setPayError(extractApiError(err, t('errors.paymentFailed')));
        } finally {
            setIsPaying(false);
        }
    }, [orders, isPaying, tableName, offlineMode, activeBranchId, tOffline, branches, paymentLabelFor, t, tMessages, refreshOrders, onActiveOrdersChanged, posTerminalUuid, dispatchPaymentReceiptPrints]);

    const handleTransferTable = useCallback(async (targetTableId: string) => {
        if (!tableId) return;
        setIsTransferLoading(true);
        try {
            await api.post('/orders/main/transfer_table/', {
                from_table_id: tableId,
                to_table_id: targetTableId
            }, { ...skipInterceptorToast });
            onPaymentComplete?.(); 
            onClose();
        } catch (e: unknown) {
            toastApiError(e, tMessages('transferFailed'));
        } finally {
            setIsTransferLoading(false);
        }
    }, [tableId, onPaymentComplete, onClose, tMessages]);

    const applyDiscount = useCallback(async () => {
        const amount = parseFloat(discountAmount);
        if (isNaN(amount) || amount <= 0) {
            setDiscountError(t('errors.invalidAmount'));
            return;
        }
        const targetOrderId = discountOrderId || orders[0]?.id;
        if (!targetOrderId) return;

        const payload: Record<string, string | number> = {
            discount_type: discountType,
            discount_amount: amount,
        };
        if (discountType === 'ITEM' && discountItemId) {
            payload.order_item_id = discountItemId;
        }

        setIsApplyingDiscount(true);
        setDiscountError(null);
        try {
            await api.post(`/orders/main/${targetOrderId}/apply_discount/`, payload);
            setDiscountAmount('');
            setDiscountItemId('');
            setShowDiscountPanel(false);
            refreshOrders();
            onActiveOrdersChanged?.();
        } catch (e: unknown) {
            const msg = isAxiosError(e)
                ? (e.response?.data as { error?: string } | undefined)?.error
                : undefined;
            setDiscountError(msg || t('errors.discountApplyFailed'));
        } finally {
            setIsApplyingDiscount(false);
        }
    }, [discountAmount, discountOrderId, orders, discountType, discountItemId, refreshOrders, onActiveOrdersChanged, t]);

    const handleRemoveDiscount = useCallback(async (targetOrderId: string) => {
        setIsApplyingDiscount(true);
        try {
            await api.post(`/orders/main/${targetOrderId}/remove_discount/`, undefined, { ...skipInterceptorToast });
            await refreshOrders();
            onActiveOrdersChanged?.();
        } catch (e: unknown) {
            toastApiError(e, t('errors.discountRemoveFailed'));
        } finally {
            setIsApplyingDiscount(false);
        }
    }, [refreshOrders, onActiveOrdersChanged, t]);

    const handleSelectCustomer = useCallback(async (customerId: string | null) => {
        const targetOrderId = orders[0]?.id;
        if (!targetOrderId) return;
        try {
            await api.patch(`/orders/main/${targetOrderId}/`, { customer: customerId }, { ...skipInterceptorToast });
            await refreshOrders();
            onActiveOrdersChanged?.();
        } catch (e: unknown) {
            toastApiError(e, "Müşteri güncellenemedi");
        }
    }, [orders, refreshOrders, onActiveOrdersChanged]);

    const fetchAllTables = useCallback(async () => {
        try {
            const res = await api.get('/tables/');
            setAllTables(res.data.results || res.data);
        } catch (e) {
            toastApiError(e, tMessages('loadTablesFailed'));
        }
    }, [tMessages]);

    const processCancellation = useCallback(async (reasonCode: string, reasonText: string) => {
        if (!confirmCancel) return;
        const { type, id } = confirmCancel;
        
        setIsUpdatingItem(id);
        if (type === 'ORDER' || type === 'TABLE_ALL') setIsCancelling(id);

        try {
            if (type === 'TABLE_ALL') {
                await api.post('/orders/main/cancel_table/', {
                    table_id: tableId,
                    branch_id: activeBranchId,
                    reason_code: reasonCode,
                    reason_text: reasonText,
                }, skipInterceptorToast);
                onPaymentComplete?.();
                onClose();
            } else {
                const url = type === 'ORDER' ? `/orders/main/${id}/cancel/` : `/orders/items/${id}/cancel/`;
                await api.post(url, {
                    reason_code: reasonCode,
                    reason_text: reasonText,
                });
                refreshOrders();
                onActiveOrdersChanged?.();
            }
            setConfirmCancel(null);
        } catch (err: unknown) {
            toastApiError(err, tMessages('cancelFailed'));
        } finally {
            setIsUpdatingItem(null);
            setIsCancelling(null);
        }
    }, [confirmCancel, tableId, activeBranchId, refreshOrders, onActiveOrdersChanged, onPaymentComplete, onClose, tMessages]);

    const applyItemQuantityUpdate = useCallback(async (itemId: string, newQty: number, resendDeltaToKitchen = false) => {
        setIsUpdatingItem(itemId);
        try {
            await api.post(`/orders/items/${itemId}/update_quantity/`, {
                quantity: newQty,
                resend_delta_to_kitchen: resendDeltaToKitchen,
            });
            refreshOrders();
            onActiveOrdersChanged?.();
            setConfirmKitchenResend(null);
        } catch {
            toast.error(t('errors.updateQuantityFailed'));
        } finally {
            setIsUpdatingItem(null);
        }
    }, [refreshOrders, onActiveOrdersChanged, t]);

    const handleUpdateItemQuantity = useCallback(async (itemId: string, newQty: number) => {
        if (newQty <= 0) {
            const item = orders.flatMap(o => o.items).find(i => i.id === itemId);
            setConfirmCancel({ type: 'ITEM', id: itemId, name: item?.product_name || "Ürün" });
            return;
        }

        const item = orders.flatMap(o => o.items).find(i => i.id === itemId);
        const orderForItem = orders.find((o) => o.items.some((i) => i.id === itemId));
        const effectiveQty = item && orderForItem
            ? getEffectiveOrderItemQuantity(item, orderForItem.items)
            : item?.quantity ?? 0;
        if (
            item &&
            !item.parent_item &&
            item.status === 'DELIVERED' &&
            newQty > effectiveQty
        ) {
            setConfirmKitchenResend({
                itemId,
                newQty,
                productName: item.product_name,
            });
            return;
        }

        await applyItemQuantityUpdate(itemId, newQty);
    }, [orders, applyItemQuantityUpdate]);

    const confirmKitchenResendUpdate = useCallback(async (itemId: string, newQty: number) => {
        await applyItemQuantityUpdate(itemId, newQty, true);
    }, [applyItemQuantityUpdate]);

    return {
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
        setPaymentMethod: setPaymentMethodSafe,
        creditAccountId,
        creditAccountName,
        showCreditModal,
        setShowCreditModal,
        selectCreditAccount,
        isCreditSelected: paymentMethod === 'CREDIT' && !!creditAccountId,
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
    };
}
