'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Search, User as UserIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminApi } from '@/features/admin/services/adminApi';
import type { User } from '@/types/user.types';

interface CashierSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    allLabel?: string;
    className?: string;
}

/** POS kullanma yetkisine sahip kullanıcıları filtreler */
function filterCashierUsers(users: User[]): User[] {
    return users.filter(u =>
        u.role_names?.some(r => r.toLowerCase().includes('kasiyer') || r.toLowerCase().includes('cashier'))
    );
}

function userDisplayName(u: User): string {
    return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;
}

export function CashierSelect({
    value,
    onChange,
    placeholder,
    allLabel,
    className,
}: CashierSelectProps) {
    const t = useTranslations('admin');
    const [search, setSearch] = useState('');

    const { data: users = [] } = useQuery({
        queryKey: ['cashier-select', 'users'],
        queryFn: async () => {
            const res = await adminApi.getUsers({ page_size: 500 });
            return (res.results ?? []) as User[];
        },
        staleTime: 120_000,
    });

    const cashiers = useMemo(() => filterCashierUsers(users), [users]);

    const filtered = useMemo(() => {
        if (!search.trim()) return cashiers;
        const q = search.toLowerCase();
        return cashiers.filter(u =>
            userDisplayName(u).toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q)
        );
    }, [cashiers, search]);

    const displayName = useMemo(() => {
        if (!value) return null;
        const u = cashiers.find(c => String(c.id) === value);
        return u ? userDisplayName(u) : null;
    }, [value, cashiers]);

    return (
        <Select value={value || 'all'} onValueChange={(val) => onChange(!val || val === 'all' ? '' : val)}>
            <SelectTrigger className={className}>
                <div className="flex items-center gap-1.5 truncate">
                    <UserIcon size={14} className="text-muted-foreground shrink-0" />
                    <SelectValue placeholder={placeholder ?? t('sales.filters.cashierPlaceholder')}>
                        {displayName || allLabel || t('sales.filters.allCashiers')}
                    </SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {/* Arama */}
                <div className="sticky top-0 z-10 border-b border-border bg-popover px-3 py-2.5 border-border">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder={t('sales.filters.cashierPlaceholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-border text-foreground"
                            onKeyDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>

                {/* Tümü */}
                <SelectItem value="all" className="text-sm font-semibold text-muted-foreground italic">
                    {allLabel || t('sales.filters.allCashiers')}
                </SelectItem>

                {/* Kasiyerler */}
                {filtered.map(u => (
                    <SelectItem key={u.id} value={String(u.id)} className="text-sm">
                        {userDisplayName(u)}
                    </SelectItem>
                ))}

                {filtered.length === 0 && search.trim() && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {t('common.noMatch')}
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}
