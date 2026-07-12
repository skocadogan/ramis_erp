import api, { skipInterceptorToast } from '@/lib/api';
import type { PaginatedResponse } from '@/lib/types';
import type { CreditAccount, CreditAccountWritePayload, CreditTransaction } from '../types';

export async function fetchCreditAccountsPage(params?: {
  branch_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<CreditAccount>> {
  const { data } = await api.get<PaginatedResponse<CreditAccount>>('/credit/accounts/', {
    params,
  });
  return data;
}

export async function fetchLinkedCreditUserIds(branchId?: string): Promise<string[]> {
  const { data } = await api.get<{ results?: string[] }>('/credit/accounts/linked-user-ids/', {
    params: branchId ? { branch_id: branchId } : undefined,
  });
  return data.results ?? [];
}

export async function fetchCreditAccount(id: string): Promise<CreditAccount> {
  const { data } = await api.get<CreditAccount>(`/credit/accounts/${id}/`);
  return data;
}

export async function fetchPosCreditAccounts(branchId: string): Promise<CreditAccount[]> {
  const { data } = await api.get<{ results?: CreditAccount[] }>('/credit/accounts/pos-available/', {
    params: { branch_id: branchId },
  });
  return data.results ?? [];
}

export async function createCreditAccount(payload: CreditAccountWritePayload): Promise<CreditAccount> {
  const { data } = await api.post<CreditAccount>('/credit/accounts/', payload, { ...skipInterceptorToast });
  return data;
}

export async function updateCreditAccount(
  id: string,
  payload: Partial<CreditAccountWritePayload>
): Promise<CreditAccount> {
  const { data } = await api.patch<CreditAccount>(`/credit/accounts/${id}/`, payload, { ...skipInterceptorToast });
  return data;
}

export async function deleteCreditAccount(id: string): Promise<void> {
  await api.delete(`/credit/accounts/${id}/`, { ...skipInterceptorToast });
}

export async function topupCreditAccount(
  id: string,
  payload: { amount: string; notes?: string; branch?: string | null }
): Promise<CreditAccount> {
  const { data } = await api.post<CreditAccount>(`/credit/accounts/${id}/topup/`, payload, {
    ...skipInterceptorToast,
  });
  return data;
}

export async function fetchCreditTransactionsPage(
  accountId: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<CreditTransaction>> {
  const { data } = await api.get<PaginatedResponse<CreditTransaction>>(
    `/credit/accounts/${accountId}/transactions/`,
    { params }
  );
  return data;
}

export async function downloadCreditStatement(
  accountId: string,
  format: 'pdf' | 'excel'
): Promise<Blob> {
  const { data } = await api.post<Blob>(
    'reporting/module-reports/credit-account-statement/generate/',
    { params: { account_id: accountId }, format },
    { responseType: 'blob' }
  );
  return data;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}