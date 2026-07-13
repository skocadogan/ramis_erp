'use client';

import { AppShell } from '@/components/shell/AppShell';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useBranchContext } from '@/hooks/useBranchContext';
import { useModulePermissions } from '@/hooks/useModulePermissions';
import { CreditAccountList } from '@/features/credit/components/CreditAccountList';
import { useTranslations } from 'next-intl';

function CreditPageContent() {
  const t = useTranslations('credit');
  const { canManage } = useModulePermissions();
  const canManageCredit = canManage('credit.manage_account');

  const {
    branchList,
    setBranchOverride,
    effectiveBranchId,
    branchName,
    showBranchPicker,
  } = useBranchContext({ queryKey: 'credit-context' });

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex-1 space-y-6 overflow-auto p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('page.title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('page.subtitle')}</p>
              {branchName && (
                <p className="mt-1 text-xs text-muted-foreground">{t('page.branchLabel', { name: branchName })}</p>
              )}
            </div>
            {showBranchPicker && (
              <select
                value={effectiveBranchId ?? ''}
                onChange={(e) => setBranchOverride(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm border-border bg-card"
                aria-label={t('page.branchSelectAria')}
              >
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <CreditAccountList branchId={effectiveBranchId} canManage={canManageCredit} />
        </div>
      </div>
    </AppShell>
  );
}

export default function CreditPage() {
  return (
    <AuthGuard module="credit">
      <CreditPageContent />
    </AuthGuard>
  );
}
