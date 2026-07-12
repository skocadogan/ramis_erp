'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Store } from 'lucide-react';

interface Branch {
    id: string;
    name: string;
}

interface BranchSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    includeAll?: boolean;
    className?: string;
    disabled?: boolean;
}

export function BranchSelect({ 
    value, 
    onChange, 
    placeholder,
    includeAll = false, 
    className,
    disabled = false
}: BranchSelectProps) {
    const t = useTranslations('branches');
    const displayPlaceholder = placeholder ?? t('branchSelect.placeholder');
    const { data: branches, isLoading } = useQuery<Branch[]>({
        queryKey: ['branches-list'],
        queryFn: () => api.get('/branches/').then(res => res.data.results || res.data),
    });

    const selectedBranch = React.useMemo(() => {
        if (value === 'ALL') return { id: 'ALL', name: t('branchSelect.allBranches') };
        return branches?.find(b => b.id === value);
    }, [branches, value, t]);

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 h-9 px-3 py-2 rounded-md border border-border bg-background ${className}`}>
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('branchSelect.loading')}</span>
            </div>
        );
    }

    return (
        <Select value={value} onValueChange={(val) => val && onChange(val)} disabled={disabled}>
            <SelectTrigger className={`h-9 w-full bg-transparent text-xs transition-colors hover:bg-muted/30 ${className ?? ""}`}>
                <div className="flex items-center gap-2 truncate">
                    <Store size={14} className="text-muted-foreground shrink-0" />
                    <SelectValue placeholder={displayPlaceholder}>
                        {selectedBranch?.name || displayPlaceholder}
                    </SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent>
                {includeAll && <SelectItem value="ALL">{t('branchSelect.allBranches')}</SelectItem>}
                {branches?.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
