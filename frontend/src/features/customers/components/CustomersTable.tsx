"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { customersApi, FetchCustomersParams } from "../services/customersApi";
import type { Customer, CustomerType } from "../types";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Filter,
  Eye,
  FileDown,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast";
import { pageFromDrfNext } from "@/lib/pagination";

const CUSTOMER_PAGE_SIZE = 50;

interface CustomersTableProps {
  onEdit: (customer: Customer) => void;
  onView: (customer: Customer) => void;
  onAdd: () => void;
  refreshTrigger: number;
}

export function CustomersTable({ onEdit, onView, onAdd, refreshTrigger }: CustomersTableProps) {
  const t = useTranslations("customers");
  const { canManage } = useModulePermissions();
  const canManageCustomers = canManage("customers.manage_customer");

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<CustomerType | "ALL" | "">("");

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const customersQuery = useInfiniteQuery({
    queryKey: ["customers", "infinite", debouncedSearch, filterType, refreshTrigger],
    queryFn: async ({ pageParam = 1 }) => {
      const params: FetchCustomersParams = {
        page: pageParam as number,
        page_size: CUSTOMER_PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterType && filterType !== "ALL") params.customer_type = filterType;
      return customersApi.getCustomers(params);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
  });

  const customers = useMemo(
    () => customersQuery.data?.pages.flatMap((p) => p.results || []) ?? [],
    [customersQuery.data?.pages],
  );
  const totalCount = customersQuery.data?.pages[0]?.count ?? 0;

  const refetchCustomers = () => customersQuery.refetch();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await customersApi.deleteCustomer(deleteTarget.id);
      toastApiSuccess(t("messages.deleteSuccess"));
      setDeleteTarget(null);
      refetchCustomers();
    } catch (e) {
      toastApiError(e, "Müşteri silinemedi");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const blob = await customersApi.exportExcel({
        search: debouncedSearch,
        customer_type: filterType,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `musteriler_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toastApiSuccess(t("messages.exportExcelSuccess") || "Excel raporu başarıyla indirildi");
    } catch (e) {
      toastApiError(e, "Excel raporu alınamadı");
    }
  };

  const handleExportPdf = async () => {
    try {
      const blob = await customersApi.exportPdf({
        search: debouncedSearch,
        customer_type: filterType,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `musteriler_${new Date().toISOString().split("T")[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toastApiSuccess(t("messages.exportPdfSuccess") || "PDF raporu başarıyla indirildi");
    } catch (e) {
      toastApiError(e, "PDF raporu alınamadı");
    }
  };

  const selClass =
    "border border-border rounded-lg px-3 py-1.5 text-sm bg-card border-border text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toplam {totalCount} müşteri kaydı bulunuyor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium hover: border-border bg-muted text-foreground dark:hover: transition-colors"
          >
            <FileDown size={15} />
            {t("messages.exportExcel")}
          </button>
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium hover: border-border bg-muted text-foreground dark:hover: transition-colors"
          >
            <FileDown size={15} />
            {t("messages.exportPdf")}
          </button>
          {canManageCustomers && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={15} />
              {t("addNew")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Müşteri adı, telefon veya e-posta ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-border text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as CustomerType | "ALL")}
            className={selClass}
          >
            <option value="ALL">{t("types.ALL")}</option>
            <option value="INDIVIDUAL">{t("types.INDIVIDUAL")}</option>
            <option value="CORPORATE">{t("types.CORPORATE")}</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card border-border">
        {customersQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : customers.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground">{t("table.empty")}</div>
        ) : (
          <VirtualTable
            rows={customers}
            rowHeight={56}
            overscan={10}
            fetchMore={customersQuery.fetchNextPage}
            hasMore={!!customersQuery.hasNextPage}
            isFetchingNextPage={customersQuery.isFetchingNextPage}
            className="max-h-[calc(100vh-16rem)]"
            tableClassName="w-full text-sm rounded-lg"
            header={
              <thead className={virtualTableStickyHeadClass}>
                <tr>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colName")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colType")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colPhone")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colEmail")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colTax")}
                  </th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("table.colActions")}
                  </th>
                </tr>
              </thead>
            }
            loadingMore={
              <tr>
                <td colSpan={6} className="py-3 text-center">
                  <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                </td>
              </tr>
            }
            renderRow={(c) => (
              <>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold bg-muted text-muted-foreground">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">{c.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant={c.customer_type === "CORPORATE" ? "secondary" : "outline"}>
                    {t(`types.${c.customer_type}`)}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.phone || "—"}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.email || "—"}</td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {c.customer_type === "CORPORATE"
                    ? `VKN: ${c.tax_no || "—"}`
                    : `TC: ${c.tc_no || "—"}`}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => onView(c)}
                      className="p-2 rounded-lg hover: text-muted-foreground hover: dark:hover:"
                      title={t("detailTitle")}
                    >
                      <Eye size={15} />
                    </button>
                    {canManageCustomers && (
                      <>
                        <button
                          onClick={() => onEdit(c)}
                          className="p-2 rounded-lg hover: text-muted-foreground hover:text-blue-600 dark:hover:"
                          title={t("edit")}
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-2 rounded-lg hover:bg-rose-50 text-muted-foreground hover:text-rose-600 dark:hover:bg-rose-950/30"
                          title="Sil"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </>
            )}
          />
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Müşteri Silinecek</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.deleteConfirm")}{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
              className="gap-2 bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 size={14} className="animate-spin" />}
              {isDeleting ? "Siliniyor..." : "Evet, Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
