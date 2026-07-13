"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { toastApiError } from "@/lib/operationalToast";
import { Button } from "@/components/ui/button";

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
import type { PaginatedResponse } from "@/lib/types";
import type { CreditAccount } from "../types";
import { deleteCreditAccount, fetchCreditAccountsPage } from "../services/creditApi";
import { CreditAccountsTable } from "./CreditAccountsTable";
import { CreditAccountFormModal } from "./CreditAccountFormModal";
import { CreditAccountDetailModal } from "./CreditAccountDetailModal";

interface CreditAccountListProps {
  branchId: string | undefined;
  canManage: boolean;
}

function parseNextPage(next: string | null): number | undefined {
  if (!next) return undefined;
  try {
    const url = new URL(next, "http://local");
    const page = url.searchParams.get("page");
    return page ? parseInt(page, 10) : undefined;
  } catch {
    return undefined;
  }
}

export function CreditAccountList({ branchId, canManage }: CreditAccountListProps) {
  const t = useTranslations("credit");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<CreditAccount | null>(null);
  const [detailAccount, setDetailAccount] = useState<CreditAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CreditAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<PaginatedResponse<CreditAccount>>({
    queryKey: ["credit-accounts", branchId, debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchCreditAccountsPage({
        ...(branchId ? { branch_id: branchId } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        page: typeof pageParam === "number" ? pageParam : 1,
      }),
    getNextPageParam: (lastPage) => parseNextPage(lastPage.next),
    initialPageParam: 1,
    enabled: !!branchId,
  });

  const accounts = useMemo(
    () => pages?.pages.flatMap((page) => page.results) ?? [],
    [pages],
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["credit-accounts"] });

  const syncDetailAccount = async () => {
    await qc.invalidateQueries({ queryKey: ["credit-account", detailAccount?.id] });
    await invalidate();
    const { data } = await refetch();
    if (!detailAccount) return;
    const flat = data?.pages.flatMap((p) => p.results) ?? [];
    setDetailAccount(flat.find((a) => a.id === detailAccount.id) ?? detailAccount);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCreditAccount(deleteTarget.id);
      toast.success(t("toast.deleted"));
      if (detailAccount?.id === deleteTarget.id) {
        setDetailAccount(null);
      }
      setDeleteTarget(null);
      invalidate();
    } catch (e) {
      toastApiError(e, t("toast.operationFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!branchId) {
    return <p className="text-sm text-muted-foreground">{t("page.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          className="min-w-[200px] flex-1 rounded-lg border border-border px-3 py-2 text-sm border-border bg-card"
        />
        {canManage && (
          <Button
            
            onClick={() => {
              setEditAccount(null);
              setFormOpen(true);
            }}
            className="gap-2"
          >
            <Wallet size={16} />
            {t("page.newAccount")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("page.empty")}</p>
      ) : (
        <CreditAccountsTable
          accounts={accounts}
          canManage={canManage}
          onView={setDetailAccount}
          onEdit={(acc) => {
            setEditAccount(acc);
            setFormOpen(true);
          }}
          onDelete={(acc) => setDeleteTarget(acc)}
          infiniteControls={{
            fetchNextPage: () => void fetchNextPage(),
            hasNextPage: !!hasNextPage,
            isFetchingNextPage,
          }}
        />
      )}

      {formOpen && (
        <CreditAccountFormModal
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditAccount(null);
          }}
          branchId={branchId}
          account={editAccount}
          onSaved={() => {
            invalidate();
            void qc.invalidateQueries({ queryKey: ["credit-linked-users"] });
          }}
        />
      )}

      {detailAccount && (
        <CreditAccountDetailModal
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
          canManage={canManage}
          onUpdated={() => syncDetailAccount()}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detail.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  {t("detail.deleteConfirm")}
                  <span className="mt-1 block font-medium text-foreground">{deleteTarget.full_name}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 size={13} className="animate-spin" />}
              {isDeleting ? t("form.save") : t("detail.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
