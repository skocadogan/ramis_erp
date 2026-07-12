import type { LucideIcon } from 'lucide-react';
import { Banknote, CreditCard, MoreHorizontal, Wallet } from 'lucide-react';
import { SplitPaymentMethod } from './types';

export const STATUS_CONFIG: Record<string, { labelKey: string; className: string }> = {
    PENDING:    { labelKey: 'pending',       className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    PREPARING:  { labelKey: 'preparing',     className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    READY:      { labelKey: 'ready',         className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    DELIVERED:  { labelKey: 'delivered',     className: 'bg-slate-100 text-muted-foreground dark:bg-slate-800 dark:text-muted-foreground' },
    CANCELLED:  { labelKey: 'cancelled',     className: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
    COMPLETED:  { labelKey: 'completed',     className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export const PAYMENT_METHODS: { value: SplitPaymentMethod; icon: LucideIcon }[] = [
    { value: 'CASH',  icon: Banknote },
    { value: 'CARD',  icon: CreditCard },
    { value: 'OTHER', icon: MoreHorizontal },
];

export const PAYMENT_ICONS: Record<string, LucideIcon> = {
    CASH: Banknote,
    CARD: CreditCard,
    OTHER: MoreHorizontal,
    CREDIT: Wallet,
};
