import React, { useMemo, useState, memo } from 'react';
import { Loader2, Trash2, Plus, Minus, Search, CreditCard, Wallet, X, Banknote, MessageSquare } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { formatAmount } from '@/lib/formatters';
import { useCanViewAmounts } from '@/hooks/useCanViewAmounts';
import { OrderDetail, OrderItem, PaymentMethod } from './types';
import { STATUS_CONFIG } from './constants';
import {
    getEffectiveOrderItemQuantity,
    isKitchenResendPendingSibling,
} from '@/features/orders/utils/orderItemQuantity';

interface OrderItemsListProps {
    orders: OrderDetail[];
    isCancelling: string | null;
    isUpdatingItem: string | null;
    handleCancelOrder: (id: string, idx: number) => void;
    handleCancelOrderItem: (id: string, name: string) => void;
    handleUpdateItemQuantity: (id: string, qty: number) => void;
    readOnly?: boolean;
    hideDeliveredQuantityControls?: boolean;
    handleSingleOrderPayment?: (orderId: string, method: PaymentMethod) => Promise<void>;
    isPaying?: boolean;
}

const OrderItemRow = memo(({ 
    item, 
    visibleChildren, 
    isUpdatingItem, 
    handleUpdateItemQuantity, 
    handleCancelOrderItem,
    readOnly,
    hideDeliveredQuantityControls,
    canViewAmounts,
    orderItems,
}: { 
    item: OrderItem; 
    visibleChildren: OrderItem[]; 
    isUpdatingItem: boolean;
    handleUpdateItemQuantity: (id: string, qty: number) => void;
    handleCancelOrderItem: (id: string, name: string) => void;
    readOnly: boolean;
    hideDeliveredQuantityControls: boolean;
    canViewAmounts: boolean;
    orderItems: OrderItem[];
}) => {
    const t = useTranslations('tables.orderModal');
    const displayQuantity = getEffectiveOrderItemQuantity(item, orderItems);
    const showQuantityControls =
        !readOnly &&
        item.status !== 'CANCELLED' &&
        !(hideDeliveredQuantityControls && item.status === 'DELIVERED');
    return (
        <div className="py-2 first:pt-0 last:pb-0 sm:py-2.5">
            <div className="flex gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md bg-blue-600 px-1 text-xs font-bold text-white shadow-sm sm:h-8 sm:min-w-[2rem] sm:text-sm">
                            {displayQuantity}×
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                                {item.product_name}
                                {item.unit_name && (
                                    <span className="ml-1 text-sub font-semibold italic text-blue-600 dark:text-blue-400">
                                        ({item.unit_name})
                                    </span>
                                )}
                            </p>
                            {item.variant_name && (
                                <p className="text-2xs text-muted-foreground">
                                    {item.variant_name}
                                </p>
                            )}
                            {(item.modifiers ?? []).length > 0 && (
                                <p className="text-2xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    * {(item.modifiers ?? []).map((m) => m.modifier_name).join(", ")}
                                </p>
                            )}
                            {item.notes?.trim() && (
                                <p className="mt-0.5 flex items-start gap-1 text-xs text-foreground">
                                    <MessageSquare size={10} className="mt-0.5 shrink-0" />
                                    <span>{item.notes}</span>
                                </p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                {showQuantityControls && (
                                    <div className="flex items-center overflow-hidden rounded-lg border border-border border-border bg-muted">
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateItemQuantity(item.id, displayQuantity - 1)}
                                            disabled={isUpdatingItem}
                                            className="touch-manipulation p-1.5 transition-colors hover: active: text-muted-foreground dark:hover: sm:p-2"
                                        >
                                            <Minus size={16} aria-hidden />
                                        </button>
                                        <div className="h-6 w-px bg-accent" />
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateItemQuantity(item.id, displayQuantity + 1)}
                                            disabled={isUpdatingItem}
                                            className="touch-manipulation p-1.5 transition-colors hover: active: text-muted-foreground dark:hover: sm:p-2"
                                        >
                                            <Plus size={16} aria-hidden />
                                        </button>
                                    </div>
                                )}
                                {!readOnly && item.status !== 'CANCELLED' && (
                                    <button
                                        type="button"
                                        onClick={() => handleCancelOrderItem(item.id, item.product_name)}
                                        disabled={isUpdatingItem}
                                        className="flex items-center gap-0.5 text-2xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                                    >
                                        <Trash2 size={10} /> {t('cancel')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <p className="text-sm font-semibold font-mono tabular-nums text-foreground sm:text-base">
                        {formatAmount(item.total_price, canViewAmounts)}
                    </p>
                    <span
                        className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-3xs font-medium sm:text-2xs ${(STATUS_CONFIG[item.status] ?? { className: ' text-muted-foreground' }).className}`}
                    >
                        {t(`status.${(STATUS_CONFIG[item.status] ?? { labelKey: item.status.toLowerCase() }).labelKey}`)}
                    </span>
                </div>
            </div>

            {visibleChildren.length > 0 ? (
                <div className="mt-1.5 border-l-2 pl-3 border-border sm:ml-8 sm:pl-3">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('combinedContents')}
                    </p>
                    <ul className="mt-0.5 space-y-0">
                        {visibleChildren.map((child) => (
                            <li
                                key={child.id}
                                className="flex items-baseline justify-between gap-2 py-0.5 text-sub leading-snug"
                            >
                                <span className="min-w-0 truncate text-muted-foreground">
                                    <span className="font-bold tabular-nums">{child.quantity}×</span>{' '}
                                    {child.product_name}
                                </span>
                                <span
                                    className={`shrink-0 text-2xs font-medium ${(STATUS_CONFIG[child.status] ?? { className: 'text-muted-foreground' }).className}`}
                                >
                                    {t(`status.${(STATUS_CONFIG[child.status] ?? { labelKey: child.status.toLowerCase() }).labelKey}`)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
});

OrderItemRow.displayName = 'OrderItemRow';

function itemSearchHaystack(item: { product_name: string; variant_name?: string | null; unit_name?: string | null }): string {
    return [item.product_name, item.variant_name ?? '', item.unit_name ?? '']
        .join(' ')
        .toLowerCase();
}

function parentShouldShow(
    order: OrderDetail,
    parentId: string,
    filterLower: string
): boolean {
    if (!filterLower) return true;
    const parent = order.items.find((i) => i.id === parentId);
    if (!parent || parent.parent_item) return false;
    if (itemSearchHaystack(parent).includes(filterLower)) return true;
    return order.items.some(
        (c) => c.parent_item === parentId && itemSearchHaystack(c).includes(filterLower)
    );
}

const OrderItemsListImpl = ({
    orders,
    isCancelling,
    isUpdatingItem,
    handleCancelOrder,
    handleCancelOrderItem,
    handleUpdateItemQuantity,
    readOnly = false,
    hideDeliveredQuantityControls = false,
    handleSingleOrderPayment,
    isPaying = false,
}: OrderItemsListProps) => {
    const t = useTranslations('tables.orderModal');
    const locale = useLocale();
    const canViewAmounts = useCanViewAmounts();
    const [itemFilter, setItemFilter] = useState('');
    const [activePaymentOrderId, setActivePaymentOrderId] = useState<string | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

    const filterLower = itemFilter.trim().toLowerCase();

    const parentItemCount = useMemo(
        () => orders.reduce((n, o) => n + o.items.filter((i) => !i.parent_item).length, 0),
        [orders]
    );

    const filteredParentCount = useMemo(() => {
        if (!filterLower) return parentItemCount;
        return orders.reduce((n, order) => {
            const parents = order.items.filter((i) => !i.parent_item);
            return n + parents.filter((p) => parentShouldShow(order, p.id, filterLower)).length;
        }, 0);
    }, [orders, filterLower, parentItemCount]);

    const showSearchBar = parentItemCount >= 3;

    return (
        <div className="flex min-h-0 flex-col">
            {showSearchBar && (
                <div className="sticky top-0 z-10 border-b px-2 py-2 border-border bg-card sm:px-3">
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground"
                            aria-hidden
                        />
                        <input
                            type="search"
                            value={itemFilter}
                            onChange={(e) => setItemFilter(e.target.value)}
                            placeholder={t('searchProducts')}
                            enterKeyHint="search"
                            autoComplete="off"
                            className="w-full rounded-lg border border-border py-2 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 border-input bg-muted text-foreground dark:placeholder:text-muted-foreground"
                        />
                    </div>
                    {filterLower ? (
                        <p className="mt-1 text-sub font-medium text-muted-foreground">
                            {filteredParentCount === 0
                                ? t('noProductsFound')
                                : t('itemCount', { count: filteredParentCount, total: parentItemCount })}
                        </p>
                    ) : null}
                </div>
            )}

            <div className="space-y-3 px-2 py-2 sm:space-y-4 sm:px-3 sm:py-3">
                {orders.map((order, idx) => (
                    <div key={order.id}>
                        {orders.length > 1 && (
                            <>
                                <div className="mb-2 flex flex-wrap items-center gap-2 sm:mb-3">
                                    <span className="text-xs font-bold tracking-widertext-muted-foreground sm:text-sm">
                                        {order.order_number || t('orderNum', { num: idx + 1 })}
                                    </span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-2xs font-semibold sm:text-xs tracking-wide ${(STATUS_CONFIG[order.status] ?? { className: ' text-muted-foreground' }).className}`}
                                    >
                                        {t(`status.${(STATUS_CONFIG[order.status] ?? { labelKey: order.status.toLowerCase() }).labelKey}`)}
                                    </span>
                                    <span className="ml-auto text-xs font-medium text-muted-foreground sm:text-sm">
                                        {new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }).format(new Date(order.created_at))}
                                    </span>
                                    {!readOnly && handleSingleOrderPayment && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (activePaymentOrderId === order.id) {
                                                    setActivePaymentOrderId(null);
                                                } else {
                                                    setActivePaymentOrderId(order.id);
                                                }
                                            }}
                                            disabled={isPaying || !!isCancelling}
                                            className={`rounded-md p-1.5 transition-all duration-200 ${
 activePaymentOrderId === order.id
 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 ring-1 ring-blue-500/20'
 : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/20'
 }`}
                                            title="Siparişi Öde"
                                        >
                                            <Wallet size={16} className="transition-transform duration-200 active:scale-95" />
                                        </button>
                                    )}
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => handleCancelOrder(order.id, idx)}
                                            disabled={isPaying || !!isCancelling}
                                            className="rounded-md p-1.5 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                                            title={t('cancelOrder')}
                                        >
                                            {isCancelling === order.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                        </button>
                                    )}
                                </div>

                                {activePaymentOrderId === order.id && (
                                    <div className="mb-3 mt-1.5 overflow-hidden rounded-xl border /50 p-2.5 border-border bg-card/30 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-2xs font-semibold text-muted-foreground sm:text-xs">
                                                Ödeme Yöntemi Seçin:
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                                {/* CASH */}
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setSelectedMethod('CASH');
                                                        await handleSingleOrderPayment?.(order.id, 'CASH');
                                                        setSelectedMethod(null);
                                                        setActivePaymentOrderId(null);
                                                    }}
                                                    disabled={isPaying}
                                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                                                >
                                                    {isPaying && selectedMethod === 'CASH' ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <Banknote size={12} />
                                                    )}
                                                    {t('cash')}
                                                </button>
                                                {/* CARD */}
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setSelectedMethod('CARD');
                                                        await handleSingleOrderPayment?.(order.id, 'CARD');
                                                        setSelectedMethod(null);
                                                        setActivePaymentOrderId(null);
                                                    }}
                                                    disabled={isPaying}
                                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
                                                >
                                                    {isPaying && selectedMethod === 'CARD' ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <CreditCard size={12} />
                                                    )}
                                                    {t('card')}
                                                </button>
                                                {/* OTHER */}
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setSelectedMethod('OTHER');
                                                        await handleSingleOrderPayment?.(order.id, 'OTHER');
                                                        setSelectedMethod(null);
                                                        setActivePaymentOrderId(null);
                                                    }}
                                                    disabled={isPaying}
                                                    className="inline-flex h-8 items-center justify-center gap-1 rounded-lg px-3 text-xs font-bold text-white shadow-sm transition-all duration-200 hover: active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:hover:"
                                                >
                                                    {isPaying && selectedMethod === 'OTHER' ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <Wallet size={12} />
                                                    )}
                                                    {t('other')}
                                                </button>
                                                {/* CANCEL */}
                                                <button
                                                    type="button"
                                                    onClick={() => setActivePaymentOrderId(null)}
                                                    disabled={isPaying}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover: border-border bg-muted text-muted-foreground dark:hover:"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="divide-y divide-border">
                            {order.items
                                .filter((item) => !item.parent_item)
                                .filter((item) => !isKitchenResendPendingSibling(item, order.items))
                                .filter((parent) => parentShouldShow(order, parent.id, filterLower))
                                .map((item) => {
                                    const children = order.items.filter((c) => c.parent_item === item.id);
                                    const showAllChildren =
                                        !filterLower || itemSearchHaystack(item).includes(filterLower);
                                    const visibleChildren = showAllChildren
                                        ? children
                                        : children.filter((c) =>
                                              itemSearchHaystack(c).includes(filterLower)
                                          );

                                    return (
                                        <OrderItemRow 
                                            key={item.id}
                                            item={item}
                                            visibleChildren={visibleChildren}
                                            isUpdatingItem={isUpdatingItem === item.id}
                                            handleUpdateItemQuantity={handleUpdateItemQuantity}
                                            handleCancelOrderItem={handleCancelOrderItem}
                                            readOnly={readOnly}
                                            hideDeliveredQuantityControls={hideDeliveredQuantityControls}
                                            orderItems={order.items}
                                            canViewAmounts={canViewAmounts}
                                        />
                                    );
                                })}
                        </div>

                        {orders.length > 1 && (
                            <div className="flex justify-end pt-1">
                                <span className="font-semibold text-muted-foreground font-mono">
                                    {t('subtotal')}:{' '}
                                    {formatAmount(order.total_amount, canViewAmounts)}
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const OrderItemsList = memo(OrderItemsListImpl) as typeof OrderItemsListImpl & { displayName?: string };
OrderItemsList.displayName = "OrderItemsList";
export { OrderItemsList };
