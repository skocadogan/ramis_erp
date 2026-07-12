'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, ReceiptText, ChevronDown, ChevronRight, Trash2, Tag, Percent, CreditCard, Banknote, CheckCircle2, CornerDownRight } from 'lucide-react';
import api, { skipInterceptorToast } from '@/lib/api';
import { isAxiosError } from 'axios';
import { extractApiError, toastApiError } from '@/lib/operationalToast';
import { AMOUNT_DISPLAY_MASK, formatCurrency } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { useModulePermissions } from '@/hooks/useModulePermissions';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { OrderStatusBadge } from '@/components/ui/order-status-badge';
import { usePosStore } from "@/store/usePosStore";
import { usePosBranches } from "@/features/pos/hooks/usePosBranches";
import { OrderDetail, PaymentMethod, TableOrderModalProps } from '../TableOrderModal/types';
import { OrderFooter } from '../TableOrderModal/OrderFooter';
import { defaultSplitAmounts, type SplitAmountsState } from '../TableOrderModal/OrderFooter';
import { PAYMENT_METHODS } from '../TableOrderModal/constants';
import { NumberInput } from '@/components/ui/number-input';
import { useOrderModalLogic } from '../../hooks/useOrderModalLogic';
import { useTranslations } from 'next-intl';
import { CancelConfirmationDialog } from '../TableOrderModal/CancelConfirmationDialog';
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { usePosConnectivity } from "@/features/pos/offline/connectivity";
import { executeOrEnqueue } from "@/features/pos/offline/executeOrEnqueue";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/store/useAuthStore";
import { dispatchReceiptPrints } from "@/features/pos/lib/dispatchReceiptPrints";
import { buildPrintJobIdempotencyKey } from "@/features/pos/lib/printIdempotency";
import { receiptLineFromOrderItem } from "@/lib/receiptOrderItems";
import {
  shouldSyncPosCustomerDisplay,
  signalPosCustomerDisplaySuccess,
} from "@/features/pos/lib/posCustomerDisplaySync";

export function TakeawayOrderModal({
    tableId,
    orderId,
    tableName,
    onClose,
    onPaymentComplete,
    onActiveOrdersChanged,
    onNewOrder,
}: TableOrderModalProps) {
    const { canManage } = useModulePermissions();
    const t = useTranslations('tables.takeawayModal');
    const tOffline = useTranslations("pos.offlineQueue");
    const { offlineMode } = usePosConnectivity();
    const tOrder = useTranslations('tables.orderModal');
    const tPos = useTranslations('pos');
    const canApplyDiscount = canManage('pos.apply_discount');
    const canManageTakeaway = canManage('takeaway.manage_takeaway');
    const canViewAmounts = useCanViewAmounts();

    const [orders, setOrders] = useState<OrderDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
    const [isPaying, setIsPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    
    // Cancellation (masa siparişi ile aynı gerekçe akışı + audit metadata)
    const [confirmCancel, setConfirmCancel] = useState<{
        type: 'ORDER';
        id: string;
        name?: string;
    } | null>(null);
    
    // Single Order Payment
    const [paymentOrder, setPaymentOrder] = useState<OrderDetail | null>(null);
    const [singlePaymentMethod, setSinglePaymentMethod] = useState<PaymentMethod>('CASH');
    const [singleSplit, setSingleSplit] = useState(false);
    const [singleSplitAmt, setSingleSplitAmt] = useState<SplitAmountsState>(defaultSplitAmounts);

    // Single Order Discount
    const [discountOrder, setDiscountOrder] = useState<OrderDetail | null>(null);
    const [discountAmount, setDiscountAmount] = useState<string>('0');
    const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
    const [discountError, setDiscountError] = useState<string | null>(null);
    const [stockWarning, setStockWarning] = useState<{ message: string; onConfirm: () => void } | null>(null);

    const activePaymentMethod = paymentOrder 
        ? (singleSplit ? 'OTHER' : singlePaymentMethod) 
        : paymentMethod;

    const { refreshOrders, setActiveDisplayOrder, setDisplayMetadata } = useOrderModalLogic({
        tableId,
        orderId,
        paymentMethod: activePaymentMethod,
        isPaying,
        setOrders,
        onPaymentComplete,
        onClose,
    });

    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        if (paymentOrder) {
            setActiveDisplayOrder([paymentOrder]);
        } else if (orders.length > 0) {
            setActiveDisplayOrder(orders);
        }
    }, [paymentOrder, orders, setActiveDisplayOrder]);

    // Mount: müşteri ekranına ödeme modunu hemen bildir (TableOrderModal ile aynı pattern)
    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        setDisplayMetadata({ isPaymentMode: true, paymentMethod: activePaymentMethod });
        return () => {
            setActiveDisplayOrder(null);
            setDisplayMetadata({ isPaymentMode: false, paymentMethod: null, isProcessing: false });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Veri yükle (tableId / orderId değişince)
    useEffect(() => {
        setIsLoading(true);
        refreshOrders().finally(() => setIsLoading(false));
    }, [tableId, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Tekli ödeme paneli açıldığında / kapandığında müşteri ekranını güncelle
    useEffect(() => {
        if (!shouldSyncPosCustomerDisplay()) return;
        if (paymentOrder) {
            setDisplayMetadata({ isPaymentMode: true, paymentMethod: singleSplit ? 'OTHER' : singlePaymentMethod });
        } else {
            setDisplayMetadata({ isPaymentMode: true, paymentMethod: activePaymentMethod });
        }
    }, [paymentOrder, singlePaymentMethod, singleSplit]); // eslint-disable-line react-hooks/exhaustive-deps

    const { data: branches = [] } = usePosBranches();
    const { activeBranchId, posTerminalUuid, paymentPrinters, autoPrintPayment } = usePosStore(useShallow((s) => ({
        activeBranchId: s.activeBranchId,
        posTerminalUuid: s.posTerminalUuid,
        paymentPrinters: s.paymentPrinters,
        autoPrintPayment: s.autoPrintPayment,
    })));
    const user = useAuthStore((s) => s.user);
    const tPrintErr = useTranslations('pos.errors');

    const methodLabel = useCallback((m: string) => tPos(`payment.${m.toLowerCase() as 'cash' | 'card' | 'other'}`), [tPos]);

    const dispatchPaymentReceiptPrints = useCallback((
        printContext: {
            orderNumber: string;
            items: Array<{ name: string; qty: number; price: number; unit: string; notes?: string }>;
            subtotal: number;
            discount: number;
            total: number;
            branchName: string;
            paymentLabel: string;
            paymentsData: Array<{ method: string; amount: number } | null>;
            idempotencyPrefix: string;
        }
    ) => {
        if (!autoPrintPayment || paymentPrinters.length === 0) return;
        const jobs = paymentPrinters
            .filter((j) => j.printerId && j.templateSlug)
            .map((job) => ({
                templateSlug: job.templateSlug,
                printerId: job.printerId,
                context: {
                    order_number: printContext.orderNumber,
                    table_name: tableName || "Paket",
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
                },
                idempotencyKey: buildPrintJobIdempotencyKey(printContext.idempotencyPrefix, job.printerId, job.templateSlug),
            }));
        void dispatchReceiptPrints(jobs, {
            getPrinterErrorMessage: (id) => tPrintErr("printerQueue", { id }),
        });
    }, [autoPrintPayment, paymentPrinters, tableName, user, tPrintErr]);

    const toggleExpand = (id: string) => {
        setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const processCancellation = useCallback(
        async (reasonCode: string, reasonText: string) => {
            if (!confirmCancel) return;
            try {
                await api.post(
                    `/orders/main/${confirmCancel.id}/cancel/`,
                    { reason_code: reasonCode, reason_text: reasonText },
                    { ...skipInterceptorToast },
                );
                await refreshOrders();
                onActiveOrdersChanged?.();
                setConfirmCancel(null);
            } catch (e: unknown) {
                toastApiError(e, t('toastCancelFailed'));
            }
        },
        [confirmCancel, refreshOrders, onActiveOrdersChanged, t],
    );

    const applyOrderDiscount = async () => {
        if (!discountOrder) return;
        const amount = parseFloat(discountAmount);
        if (isNaN(amount) || amount <= 0) {
            setDiscountError(t('discountInvalidAmount'));
            return;
        }

        setIsApplyingDiscount(true);
        try {
            await api.post(
                `/orders/main/${discountOrder.id}/apply_discount/`,
                {
                    discount_type: 'ORDER',
                    discount_amount: amount,
                },
                { ...skipInterceptorToast },
            );
            setDiscountAmount('0');
            setDiscountOrder(null);
            await refreshOrders();
            onActiveOrdersChanged?.();
        } catch (e: unknown) {
            setDiscountError(extractApiError(e, t('discountApplyFailed')));
        } finally {
            setIsApplyingDiscount(false);
        }
    };

    const handleRemoveDiscount = async (orderId: string) => {
        try {
            await api.post(`/orders/main/${orderId}/remove_discount/`, undefined, { ...skipInterceptorToast });
            await refreshOrders();
            onActiveOrdersChanged?.();
        } catch (e: unknown) {
            toastApiError(e, t('removeDiscountFailed'));
        }
    };

    const handleSinglePayment = async () => {
        if (!paymentOrder) return;
        setIsPaying(true);
        setPayError(null);
        try {
            const total = Number(paymentOrder.total_amount);
            let body: Record<string, unknown> = { payment_method: singlePaymentMethod };
            if (singleSplit) {
                const lines: { method: string; amount: string }[] = [];
                for (const m of PAYMENT_METHODS) {
                    const raw = singleSplitAmt[m.value].trim();
                    if (!raw) continue;
                    const n = parseFloat(raw);
                    if (!Number.isFinite(n) || n <= 0) continue;
                    lines.push({ method: m.value, amount: n.toFixed(4) });
                }
                if (lines.length < 2) {
                    setPayError(t('splitMinMethods'));
                    return;
                }
                const sum = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
                if (Math.abs(sum - total) > 0.009) {
                    setPayError(t('splitTotalMustMatch', { total: formatCurrency(total) }));
                    return;
                }
                body = { payment_method: lines[0].method, payments: lines };
            }
            if (posTerminalUuid) body.pos_terminal_id = posTerminalUuid;
            const result = await executeOrEnqueue({
                offlineMode,
                type: "COMPLETE_ORDER",
                endpoint: `/orders/main/${paymentOrder.id}/complete/`,
                payload: body,
                branchId: activeBranchId || paymentOrder.branch || "",
                label: tOffline("labels.completeOrder", { table: paymentOrder.table_name || "Paket" }),
                clientOpId: uuidv4(),
            });
            if (result.mode === "queued") {
                toast.success(tOffline("messages.queuedPayment"));
            }
            signalPosCustomerDisplaySuccess('PAYMENT');
            setPaymentOrder(null);
            setSingleSplit(false);
            setSingleSplitAmt(defaultSplitAmounts());
            await refreshOrders();
            onActiveOrdersChanged?.();
            // Fiş yazdır
            if (paymentOrder) {
                const branchId = activeBranchId || paymentOrder.branch || "";
                const branchName = branches.find(b => b.id === branchId)?.name || "Paket";
                const pmLabel = singleSplit
                    ? PAYMENT_METHODS.map(m => {
                          const raw = singleSplitAmt[m.value].trim();
                          if (!raw) return null;
                          const n = parseFloat(raw);
                          if (!Number.isFinite(n) || n <= 0) return null;
                          return `${methodLabel(m.value)}: ${formatCurrency(n)}`;
                      }).filter(Boolean).join('\n') || methodLabel(singlePaymentMethod)
                    : methodLabel(singlePaymentMethod);
                const pmData = singleSplit
                    ? PAYMENT_METHODS.map(m => {
                          const amount = parseFloat(singleSplitAmt[m.value] || '0');
                          if (amount > 0) return { method: methodLabel(m.value), amount };
                          return null;
                      }).filter(Boolean)
                    : [{ method: methodLabel(singlePaymentMethod), amount: Number(paymentOrder.total_amount) }];
                dispatchPaymentReceiptPrints({
                    orderNumber: paymentOrder.order_number || "Paket",
                    items: paymentOrder.items.map(receiptLineFromOrderItem),
                    subtotal: Number(paymentOrder.total_amount) + Number(paymentOrder.discount_amount || 0),
                    discount: Number(paymentOrder.discount_amount || 0),
                    total: Number(paymentOrder.total_amount),
                    branchName,
                    paymentLabel: pmLabel,
                    paymentsData: pmData,
                    idempotencyPrefix: `pay:${paymentOrder.id}`,
                });
            }
        } catch (err: unknown) {
            const status = isAxiosError(err) ? err.response?.status : undefined;
            const data = isAxiosError(err) ? err.response?.data as { code?: string; item_name?: string; available?: string | number; requested?: string | number } | undefined : undefined;
            if (status === 409 && data?.code === "INSUFFICIENT_STOCK") {
                const msg = t('insufficientStockOrder', {
                    item: String(data.item_name ?? ''),
                    available: String(data.available ?? ''),
                    requested: String(data.requested ?? ''),
                });
                setStockWarning({
                    message: msg,
                    onConfirm: async () => {
                        try {
                            setIsPaying(true);
                            const total = Number(paymentOrder.total_amount);
                            let body: Record<string, unknown> = { payment_method: singlePaymentMethod, allow_negative_stock: true };
                            if (singleSplit) {
                                const lines: { method: string; amount: string }[] = [];
                                for (const m of PAYMENT_METHODS) {
                                    const raw = singleSplitAmt[m.value].trim();
                                    if (!raw) continue;
                                    const n = parseFloat(raw);
                                    if (!Number.isFinite(n) || n <= 0) continue;
                                    lines.push({ method: m.value, amount: n.toFixed(4) });
                                }
                                const sum = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
                                if (lines.length >= 2 && Math.abs(sum - total) <= 0.009) {
                                    body = { payment_method: lines[0].method, payments: lines, allow_negative_stock: true };
                                }
                            }
                            if (posTerminalUuid) body.pos_terminal_id = posTerminalUuid;
                            const result = await executeOrEnqueue({
                                offlineMode,
                                type: "COMPLETE_ORDER",
                                endpoint: `/orders/main/${paymentOrder.id}/complete/`,
                                payload: body,
                                branchId: activeBranchId || paymentOrder.branch || "",
                                label: tOffline("labels.completeOrder", { table: paymentOrder.table_name || "Paket" }),
                                clientOpId: uuidv4(),
                            });
                            if (result.mode === "queued") {
                                toast.success(tOffline("messages.queuedPayment"));
                            }
                            signalPosCustomerDisplaySuccess('PAYMENT');
                            setPaymentOrder(null);
                            setSingleSplit(false);
                            setSingleSplitAmt(defaultSplitAmounts());
                            await refreshOrders();
                            onActiveOrdersChanged?.();
                            // Fiş yazdır
                            if (paymentOrder) {
                                const branchId = activeBranchId || paymentOrder.branch || "";
                                const branchName = branches.find(b => b.id === branchId)?.name || "Paket";
                                const pmLabel = singleSplit
                                    ? PAYMENT_METHODS.map(m => {
                                          const raw = singleSplitAmt[m.value].trim();
                                          if (!raw) return null;
                                          const n = parseFloat(raw);
                                          if (!Number.isFinite(n) || n <= 0) return null;
                                          return `${methodLabel(m.value)}: ${formatCurrency(n)}`;
                                      }).filter(Boolean).join('\n') || methodLabel(singlePaymentMethod)
                                    : methodLabel(singlePaymentMethod);
                                const pmData = singleSplit
                                    ? PAYMENT_METHODS.map(m => {
                                          const amount = parseFloat(singleSplitAmt[m.value] || '0');
                                          if (amount > 0) return { method: methodLabel(m.value), amount };
                                          return null;
                                      }).filter(Boolean)
                                    : [{ method: methodLabel(singlePaymentMethod), amount: Number(paymentOrder.total_amount) }];
                                dispatchPaymentReceiptPrints({
                                    orderNumber: paymentOrder.order_number || "Paket",
                                    items: paymentOrder.items.map(receiptLineFromOrderItem),
                                    subtotal: Number(paymentOrder.total_amount) + Number(paymentOrder.discount_amount || 0),
                                    discount: Number(paymentOrder.discount_amount || 0),
                                    total: Number(paymentOrder.total_amount),
                                    branchName,
                                    paymentLabel: pmLabel,
                                    paymentsData: pmData,
                                    idempotencyPrefix: `pay:${paymentOrder.id}`,
                                });
                            }
                        } catch (e: unknown) {
                            setPayError(extractApiError(e, t('paymentFailed')));
                        } finally {
                            setIsPaying(false);
                            setStockWarning(null);
                        }
                    }
                });
                return;
            }
            setPayError(extractApiError(err, t('paymentFailed')));
        } finally {
            setIsPaying(false);
        }
    };

    const handleTablePayment = async () => {
        setIsPaying(true);
        setPayError(null);
        try {
            const result = await executeOrEnqueue({
                offlineMode,
                type: "COMPLETE_TABLE",
                endpoint: "/orders/main/complete_table/",
                payload: {
                    table_id: tableId,
                    payment_method: paymentMethod,
                    branch_id: activeBranchId || undefined,
                    ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
                },
                branchId: activeBranchId || "",
                label: tOffline("labels.completeTable", { table: tableName || "Paket" }),
                clientOpId: uuidv4(),
            });
            if (result.mode === "queued") {
                toast.success(tOffline("messages.queuedPayment"));
            }
            signalPosCustomerDisplaySuccess('PAYMENT');
            onPaymentComplete?.();
            // Fiş yazdır
            if (orders.length > 0) {
                const branchId = activeBranchId || orders[0]?.branch || "";
                const branchName = branches.find(b => b.id === branchId)?.name || "Paket";
                const allItems = orders.flatMap(o => o.items.map(receiptLineFromOrderItem));
                const totalDisc = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
                const totalGrand = orders.reduce((s, o) => s + Number(o.total_amount), 0);
                const subTotal = totalGrand + totalDisc;
                const idemBase = orders.map(o => o.id).sort().join("|");
                dispatchPaymentReceiptPrints({
                    orderNumber: orders.map(o => o.order_number).filter(Boolean).join(", ") || "PAKET",
                    items: allItems,
                    subtotal: subTotal,
                    discount: totalDisc,
                    total: totalGrand,
                    branchName,
                    paymentLabel: methodLabel(paymentMethod),
                    paymentsData: [{ method: methodLabel(paymentMethod), amount: totalGrand }],
                    idempotencyPrefix: `pay:${idemBase}`,
                });
            }
            onClose();
        } catch (err: unknown) {
            const status = isAxiosError(err) ? err.response?.status : undefined;
            const data = isAxiosError(err) ? err.response?.data as { code?: string; item_name?: string; available?: string | number; requested?: string | number } | undefined : undefined;
            if (status === 409 && data?.code === "INSUFFICIENT_STOCK") {
                const msg = t('insufficientStockTable', {
                    item: String(data.item_name ?? ''),
                    available: String(data.available ?? ''),
                    requested: String(data.requested ?? ''),
                });
                setStockWarning({
                    message: msg,
                    onConfirm: async () => {
                        try {
                            setIsPaying(true);
                            await api.post(
                                '/orders/main/complete_table/',
                                {
                                    table_id: tableId,
                                    payment_method: paymentMethod,
                                    branch_id: activeBranchId || undefined,
                                    allow_negative_stock: true,
                                    ...(posTerminalUuid ? { pos_terminal_id: posTerminalUuid } : {}),
                                },
                                { ...skipInterceptorToast },
                            );
                            signalPosCustomerDisplaySuccess('PAYMENT');
                            onPaymentComplete?.();
                            // Fiş yazdır
                            if (orders.length > 0) {
                                const branchId = activeBranchId || orders[0]?.branch || "";
                                const branchName = branches.find(b => b.id === branchId)?.name || "Paket";
                                const allItems = orders.flatMap(o => o.items.map(item => ({
                                    name: item.product_name,
                                    qty: item.quantity,
                                    price: item.unit_price,
                                    unit: item.unit_name || "",
                                    ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
                                })));
                                const totalDisc = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0);
                                const totalGrand = orders.reduce((s, o) => s + Number(o.total_amount), 0);
                                const subTotal = totalGrand + totalDisc;
                                const idemBase = orders.map(o => o.id).sort().join("|");
                                dispatchPaymentReceiptPrints({
                                    orderNumber: orders.map(o => o.order_number).filter(Boolean).join(", ") || "PAKET",
                                    items: allItems,
                                    subtotal: subTotal,
                                    discount: totalDisc,
                                    total: totalGrand,
                                    branchName,
                                    paymentLabel: methodLabel(paymentMethod),
                                    paymentsData: [{ method: methodLabel(paymentMethod), amount: totalGrand }],
                                    idempotencyPrefix: `pay:${idemBase}`,
                                });
                            }
                            onClose();
                        } catch (e: unknown) {
                            setPayError(extractApiError(e, t('paymentFailed')));
                        } finally {
                            setIsPaying(false);
                            setStockWarning(null);
                        }
                    }
                });
                return;
            }
            setPayError(extractApiError(err, t('paymentFailed')));
        } finally {
            setIsPaying(false);
        }
    };

    const grandTotal = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const totalOrderDiscount = orders.reduce((sum, o) => sum + Number(o.discount_amount || 0), 0);
    const subtotal = grandTotal + totalOrderDiscount;

    return (
        <ModalOverlay onClose={onClose} zIndex="z-50">
            <div className="w-full max-w-4xl rounded-2xl border border-border bg-white dark:bg-slate-900 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/20">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                            <ReceiptText className="text-emerald-600 dark:text-emerald-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-ui-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">{t('title')}</h2>
                            <p className="text-xs font-ui-bold text-muted-foreground uppercase tracking-widest">{tableName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onNewOrder && canManageTakeaway && (
                            <button
                                onClick={onNewOrder}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-ui-bold transition-all active:scale-95"
                            >
                                <span className="text-lg">+</span> {t('newOrder')}
                            </button>
                        )}
                        <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={40} className="animate-spin text-emerald-500" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-sub font-ui-bold uppercase tracking-widest text-muted-foreground">
                                            <th className="px-4 py-3 w-10 text-center">{t('colIndex')}</th>
                                            <th className="px-4 py-3">{t('colTime')}</th>
                                            <th className="px-4 py-3">{t('colProducts')}</th>
                                            <th className="px-4 py-3 text-right">{t('colAmount')}</th>
                                            <th className="px-4 py-3 text-center">{t('colActions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {orders.map((order) => (
                                            <React.Fragment key={order.id}>
                                                <tr className={`group transition-colors ${expandedOrders[order.id] ? 'bg-emerald-50/30 dark:bg-emerald-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                                    <td className="px-4 py-4 text-center">
                                                        <button 
                                                            onClick={() => toggleExpand(order.id)}
                                                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground transition-all"
                                                        >
                                                            {expandedOrders[order.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-ui-bold text-foreground">
                                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            <span className="text-2xs text-muted-foreground font-mono">#{order.id.slice(-6).toUpperCase()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex flex-col gap-1.5 max-w-xs">
                                                            <div className="flex flex-wrap gap-1">
                                                                {order.items.slice(0, 3).map(i => (
                                                                    <span key={i.id} className="text-2xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-ui-medium">
                                                                        {i.quantity}x {i.product_name}
                                                                    </span>
                                                                ))}
                                                                {order.items.length > 3 && (
                                                                    <span className="text-2xs text-muted-foreground font-ui-bold ml-1">+{order.items.length - 3}</span>
                                                                )}
                                                            </div>
                                                            {order.notes?.trim() && (
                                                                <p className="text-2xs text-amber-800/90 dark:text-amber-200/80 font-ui-medium line-clamp-2" title={order.notes.trim()}>
                                                                    {order.notes.trim()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-base font-ui-bold text-slate-800 dark:text-slate-100">
                                                                {canViewAmounts ? formatCurrency(order.total_amount) : AMOUNT_DISPLAY_MASK}
                                                            </span>
                                                            {(Number(order.discount_amount) || 0) > 0 && (
                                                                <span className="text-2xs text-emerald-500 font-ui-bold">
                                                                    {canViewAmounts
                                                                        ? `-${formatCurrency(order.discount_amount ?? 0)} ${t('discountSuffix')}`
                                                                        : AMOUNT_DISPLAY_MASK}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            {/* Payment Button */}
                                                            <button
                                                                onClick={() => {
                                                                    setPaymentOrder(order);
                                                                    setSinglePaymentMethod('CASH');
                                                                }}
                                                                className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all border border-emerald-200/50 dark:border-emerald-800/50"
                                                                title={t('payOrderTooltip')}
                                                            >
                                                                <CreditCard size={16} />
                                                            </button>

                                                            {/* Discount Button */}
                                                            {canApplyDiscount && (
                                                                <button
                                                                    onClick={() => {
                                                                        setDiscountOrder(order);
                                                                        setDiscountAmount('0');
                                                                        setDiscountError(null);
                                                                    }}
                                                                    className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 transition-all border border-amber-200/50 dark:border-amber-800/50"
                                                                    title={t('applyDiscountTooltip')}
                                                                >
                                                                    <Percent size={16} />
                                                                </button>
                                                            )}

                                                            {/* Cancel Button */}
                                                            <button
                                                                onClick={() =>
                                                                    setConfirmCancel({
                                                                        type: 'ORDER',
                                                                        id: order.id,
                                                                        name: t('orderShortLabel', {
                                                                            code: `#${order.id.slice(-6).toUpperCase()}`,
                                                                        }),
                                                                    })
                                                                }
                                                                className="p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-all border border-rose-200/50 dark:border-rose-800/50"
                                                                title={t('cancelOrderTooltip')}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Expanded Items */}
                                                {expandedOrders[order.id] && (
                                                    <tr className="bg-slate-50/50 dark:bg-slate-800/20">
                                                        <td colSpan={5} className="px-8 py-4 border-l-4 border-emerald-500/50">
                                                            <div className="space-y-3">
                                                                {order.notes?.trim() && (
                                                                    <div className="rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/40 dark:bg-amber-900/10">
                                                                        <p className="text-2xs font-ui-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-1">
                                                                            {t('orderNoteLabel')}
                                                                        </p>
                                                                        <p className="text-sm font-ui-medium text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
                                                                            {order.notes.trim()}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-sub font-ui-bold uppercase tracking-widest text-muted-foreground">{t('productDetailsHeading')}</h4>
                                                                    {Number(order.discount_amount || 0) > 0 && (
                                                                        <button 
                                                                            onClick={() => handleRemoveDiscount(order.id)}
                                                                            className="text-2xs font-ui-bold text-rose-500 hover:underline flex items-center gap-1"
                                                                        >
                                                                            {t('removeDiscount')}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="grid grid-cols-1 gap-2">
                                                                    {(() => {
                                                                        const parentItems = order.items.filter(i => !i.parent_item);
                                                                        return parentItems.map(parent => (
                                                                            <React.Fragment key={parent.id}>
                                                                                {/* Parent Item */}
                                                                                <div className="flex items-center justify-between p-2 bg-card rounded-lg border border-slate-100 dark:border-slate-800">
                                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                                        <span className="w-6 h-6 shrink-0 rounded bg-muted flex items-center justify-center text-xs font-ui-bold text-muted-foreground">
                                                                                            {parent.quantity}
                                                                                        </span>
                                                                                        <div className="min-w-0">
                                                                                            <div className="flex flex-wrap items-center gap-x-2">
                                                                                                <span className="text-sm font-ui-medium text-foreground">{parent.product_name}</span>
                                                                                                {parent.unit_name && <span className="text-2xs text-muted-foreground font-ui-bold uppercase">{parent.unit_name}</span>}
                                                                                            </div>
                                                                                            {parent.notes?.trim() && (
                                                                                                <p className="text-2xs text-amber-800/90 dark:text-amber-200/80 font-ui-medium mt-0.5">
                                                                                                    {parent.notes.trim()}
                                                                                                </p>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-4">
                                                                        <span className="text-sm font-ui-bold text-muted-foreground">
                                                                            {canViewAmounts
                                                                                ? formatCurrency(parent.total_price)
                                                                                : AMOUNT_DISPLAY_MASK}
                                                                        </span>
                                                                        <OrderStatusBadge status={parent.status} />
                                                                                    </div>
                                                                                </div>

                                                                                {/* Child Items */}
                                                                                {order.items.filter(child => child.parent_item === parent.id).map(child => (
                                                                                    <div key={child.id} className="flex items-center justify-between p-1.5 ml-8 bg-slate-50/50 dark:bg-slate-800/10 rounded-lg border border-dashed border-border/50">
                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                            <CornerDownRight size={14} className="text-muted-foreground shrink-0" />
                                                                                            <span className="w-5 h-5 shrink-0 rounded bg-card flex items-center justify-center text-2xs font-ui-bold text-muted-foreground">
                                                                                                {child.quantity}
                                                                                            </span>
                                                                                            <div className="min-w-0">
                                                                                                <span className="text-xs font-ui-medium text-muted-foreground">{child.product_name}</span>
                                                                                                {child.notes?.trim() && (
                                                                                                    <p className="text-2xs text-amber-800/90 dark:text-amber-200/80 font-ui-medium">
                                                                                                        {child.notes.trim()}
                                                                                                    </p>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                        <div className="flex items-center gap-4">
                                                                            <OrderStatusBadge status={child.status} />
                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </React.Fragment>
                                                                        ));
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isLoading && orders.length > 0 && !orderId && (
                    <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                        <OrderFooter 
                            orders={orders}
                            totalOrderDiscount={totalOrderDiscount}
                            subtotalBeforeOrderDiscount={subtotal}
                            grandTotal={grandTotal}
                            paymentMethod={paymentMethod}
                            setPaymentMethod={setPaymentMethod}
                            handlePayment={handleTablePayment}
                            isPaying={isPaying}
                            isLoading={isLoading}
                            payError={payError}
                        />
                    </div>
                )}
            </div>

            <CancelConfirmationDialog
                confirmCancel={confirmCancel}
                setConfirmCancel={() => setConfirmCancel(null)}
                processCancellation={processCancellation}
            />

            {/* Payment Dialog - Single Order */}
            <Dialog open={!!paymentOrder} onOpenChange={open => !open && setPaymentOrder(null)}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-600">
                             <CreditCard size={20} />
                             {t('payOrderTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {paymentOrder ? t('payOrderDescription', { code: paymentOrder.id.slice(-6).toUpperCase() }) : ''}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-4">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex justify-between items-center">
                            <span className="text-sm font-ui-bold text-muted-foreground uppercase tracking-tighter">{tOrder('grandTotal')}</span>
                            <span className="text-2xl font-ui-bold text-slate-900 dark:text-white">
                                {canViewAmounts
                                    ? formatCurrency(paymentOrder?.total_amount ?? 0)
                                    : AMOUNT_DISPLAY_MASK}
                            </span>
                        </div>

                        <label className="flex cursor-pointer items-center gap-2 text-xs font-ui-medium text-slate-600">
                            <input
                                type="checkbox"
                                checked={singleSplit}
                                onChange={(e) => {
                                    setSingleSplit(e.target.checked);
                                    if (!e.target.checked) setSingleSplitAmt(defaultSplitAmounts());
                                }}
                                className="rounded border-slate-300"
                            />
                            {t('splitPaymentLabel')}
                        </label>

                        {singleSplit ? (
                            <div className="space-y-2 rounded-xl border border-border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                                {PAYMENT_METHODS.map(({ value }) => (
                                    <div key={value} className="flex items-center gap-2">
                                        <span className="w-14 text-sub font-ui-semibold text-muted-foreground">{tPos(`payment.${value.toLowerCase() as 'cash' | 'card' | 'other'}`)}</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                                            value={singleSplitAmt[value]}
                                            onChange={(e) =>
                                                setSingleSplitAmt((p) => ({ ...p, [value]: e.target.value }))
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSinglePaymentMethod('CASH')}
                                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 ${
                                    singlePaymentMethod === 'CASH' 
                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                                    : 'bg-white border-slate-100 text-muted-foreground hover:border-border'
                                }`}
                            >
                                <Banknote size={24} />
                                <span className="text-xs font-ui-bold uppercase">{tPos('payment.cash')}</span>
                            </button>
                            <button
                                onClick={() => setSinglePaymentMethod('CARD')}
                                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 ${
                                    singlePaymentMethod === 'CARD' 
                                    ? 'bg-blue-50 border-blue-500 text-blue-600' 
                                    : 'bg-white border-slate-100 text-muted-foreground hover:border-border'
                                }`}
                            >
                                <CreditCard size={24} />
                                <span className="text-xs font-ui-bold uppercase">{tPos('payment.card')}</span>
                            </button>
                        </div>
                        )}
                        {payError && <p className="text-xs text-rose-500 font-ui-bold text-center">{payError}</p>}
                    </div>

                    <DialogFooter>
                        <button
                            onClick={handleSinglePayment}
                            disabled={isPaying}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-ui-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
                        >
                            {isPaying ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                            {singleSplit ? t('payButtonSplit') : singlePaymentMethod === 'CASH' ? t('payButtonCash') : t('payButtonCard')}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Discount Dialog - Single Order */}
            <Dialog open={!!discountOrder} onOpenChange={open => !open && setDiscountOrder(null)}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                             <Tag size={20} />
                             {t('discountDialogTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {discountOrder ? t('discountDialogDescription', { code: `#${discountOrder.id.slice(-6).toUpperCase()}` }) : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-6">
                        <div className="space-y-2">
                             <label className="text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest ml-1">{t('discountAmountLabel')}</label>
                             <NumberInput 
                                value={discountAmount}
                                onChange={setDiscountAmount}
                                placeholder="0.00"
                                className="h-14 text-2xl font-ui-bold text-slate-800 border-2 focus:border-amber-500 transition-all"
                                autoFocus
                             />
                        </div>

                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30">
                            <div className="flex justify-between items-center text-xs font-ui-bold text-amber-700 dark:text-amber-400">
                                <span className="uppercase">{t('currentTotal')}</span>
                                <span>
                                    {canViewAmounts
                                        ? formatCurrency(discountOrder?.total_amount ?? 0)
                                        : AMOUNT_DISPLAY_MASK}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs font-ui-bold mt-1 text-slate-800 dark:text-slate-100">
                                <span className="uppercase">{t('newTotal')}</span>
                                <span>
                                    {canViewAmounts
                                        ? formatCurrency(Math.max(0, Number(discountOrder?.total_amount) - (parseFloat(discountAmount) || 0)))
                                        : AMOUNT_DISPLAY_MASK}
                                </span>
                            </div>
                        </div>

                        {discountError && <p className="text-xs font-ui-bold text-rose-500 text-center">{discountError}</p>}
                    </div>

                    <DialogFooter>
                        <button
                            onClick={applyOrderDiscount}
                            disabled={isApplyingDiscount || (parseFloat(discountAmount) || 0) <= 0}
                            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-ui-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
                        >
                            {isApplyingDiscount ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                            {t('applyDiscountCta')}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!stockWarning} onOpenChange={open => !open && setStockWarning(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('insufficientStockTitle') || tOrder('insufficientStock')}</AlertDialogTitle>
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
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-ui-bold"
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
