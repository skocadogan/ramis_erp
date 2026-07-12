"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Loader2, Eye, Search, Download,
  CreditCard, Banknote, Clock,
} from "lucide-react";
import api from "@/lib/api";
import { salesApi } from "@/features/sales/services/salesApi";
import { formatAmount, formatNumber } from "@/lib/formatters";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Sale } from "@/features/sales/types";
import type { PaginatedResponse } from "@/lib/types";

interface PosTerminalOption {
  id: string;
  name: string;
  code: string;
}

interface PosUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
}

interface Props {
  branchId: string | null;
  canViewAmounts: boolean;
  terminalOptions: PosTerminalOption[];
}

export function SalesRecordsTab({ branchId, canViewAmounts, terminalOptions }: Props) {
  const t = useTranslations("shifts");
  const tAdmin = useTranslations("admin");

  const [salesDateFrom, setSalesDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [salesDateTo, setSalesDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [salesPaymentMethod, setSalesPaymentMethod] = useState("");
  const [salesTerminalId, setSalesTerminalId] = useState("");
  const [salesCreatedById, setSalesCreatedById] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const posUsersQuery = useQuery<PosUser[]>({
    queryKey: ["pos-users", branchId],
    queryFn: async () => {
      const { data } = await api.get<{ results?: PosUser[] }>("/admin/users/", {
        params: { has_permission: "pos.view_pos", page_size: 200, branch: branchId },
      });
      return data.results || [];
    },
    enabled: !!branchId,
  });

  const orderDetailQuery = useQuery({
    queryKey: ["order-detail", selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return null;
      const res = await api.get(`/orders/main/${selectedOrderId}/`);
      return res.data;
    },
    enabled: !!selectedOrderId,
  });

  const salesContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: salesInfiniteData,
    hasNextPage: salesHasNextPage,
    isFetchingNextPage: salesIsFetchingNextPage,
    fetchNextPage: salesFetchNextPage,
    isLoading: salesLoading,
    isFetching: salesFetching,
  } = useInfiniteQuery({
    queryKey: [
      "sales-infinite-list",
      branchId,
      salesDateFrom,
      salesDateTo,
      salesPaymentMethod,
      salesTerminalId,
      salesCreatedById,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      if (!branchId) {
        return {
          count: 0, results: [], next: null, previous: null,
          totals: { gross_total: 0, discount_total: 0, net_total: 0 },
        } as PaginatedResponse<Sale>;
      }
      const params: Record<string, string | number> = {
        branch_id: branchId,
        start_date: salesDateFrom,
        end_date: salesDateTo,
        page: pageParam as number,
        page_size: 100,
      };
      if (salesPaymentMethod) params.payment_method = salesPaymentMethod;
      if (salesTerminalId) params.pos_terminal_id = salesTerminalId;
      if (salesCreatedById) params.created_by_id = salesCreatedById;
      return salesApi.getSales(params);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      try {
        const url = new URL(lastPage.next);
        return Number(url.searchParams.get("page"));
      } catch {
        return undefined;
      }
    },
    initialPageParam: 1,
    enabled: !!branchId,
  });

  const sales = useMemo(() => {
    return salesInfiniteData?.pages.flatMap((p) => p.results) || [];
  }, [salesInfiniteData]);

  const salesTotals = useMemo(() => {
    const lastPage = salesInfiniteData?.pages[0];
    if (lastPage?.totals) return lastPage.totals;
    return { gross_total: 0, discount_total: 0, net_total: 0 };
  }, [salesInfiniteData]);

  const salesVirtualizer = useVirtualizer({
    count: sales.length,
    getScrollElement: () => salesContainerRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  const virtualItems = salesVirtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (
      lastItem.index >= sales.length - 1 &&
      salesHasNextPage &&
      !salesIsFetchingNextPage
    ) {
      void salesFetchNextPage();
    }
  }, [virtualItems, sales.length, salesHasNextPage, salesIsFetchingNextPage, salesFetchNextPage]);

  const downloadSalesPdf = async () => {
    if (!branchId) return;
    setIsExporting(true);
    toast.loading(t("toast.exportLoading") || "PDF hazırlanıyor...", { id: "sales-pdf-export" });
    try {
      const params = new URLSearchParams({
        branch_id: branchId,
        start_date: salesDateFrom,
        end_date: salesDateTo,
      });
      if (salesPaymentMethod) params.append("payment_method", salesPaymentMethod);
      if (salesTerminalId) params.append("pos_terminal_id", salesTerminalId);
      if (salesCreatedById) params.append("created_by_id", salesCreatedById);

      const response = await api.get(`/sales/export/pdf/`, {
        params,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `satis_raporu_${salesDateFrom}_${salesDateTo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("toast.exportSuccess") || "Rapor başarıyla indirildi.", { id: "sales-pdf-export" });
    } catch {
      toast.error(t("toast.exportError") || "Rapor üretilemedi.", { id: "shift-export" });
    } finally {
      setIsExporting(false);
    }
  };

  const paymentMethodLabel = (method: string): string => {
    const map: Record<string, string> = {
      CASH: t("cashReport.paymentCash") || "Nakit",
      CARD: t("cashReport.paymentCard") || "Kart",
      CREDIT: t("cashReport.paymentCredit") || "Veresiye",
      OTHER: t("cashReport.paymentOther") || "Diğer",
    };
    return map[method] || method;
  };

  const paymentMethodIcon = (method: string) => {
    switch (method) {
      case "CASH": return <Banknote className="size-4 text-emerald-500" />;
      case "CARD": return <CreditCard className="size-4 text-blue-500" />;
      case "CREDIT": return <Clock className="size-4 text-amber-500" />;
      default: return null;
    }
  };

  return (
    <>
      {salesLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="border-border shadow-md dark:border-slate-700 dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/5 py-0 gap-0">
          <div className="border-b border-border bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
            <h2 className="text-sm font-ui-semibold text-foreground">
              {t("salesListCard.title") || "POS Satış Kayıtları"}
            </h2>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex min-w-[9.5rem] flex-col gap-1">
                <label className="text-sub font-ui-medium uppercase tracking-wide text-muted-foreground" htmlFor="sales-filter-date-from">
                  {t("filters.dateFrom")}
                </label>
                <input
                  id="sales-filter-date-from"
                  type="date"
                  value={salesDateFrom}
                  onChange={(e) => { setSalesDateFrom(e.target.value); }}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex min-w-[9.5rem] flex-col gap-1">
                <label className="text-sub font-ui-medium uppercase tracking-wide text-muted-foreground" htmlFor="sales-filter-date-to">
                  {t("filters.dateTo")}
                </label>
                <input
                  id="sales-filter-date-to"
                  type="date"
                  value={salesDateTo}
                  onChange={(e) => { setSalesDateTo(e.target.value); }}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex min-w-[8rem] flex-col gap-1">
                <label className="text-sub font-ui-medium uppercase tracking-wide text-muted-foreground" htmlFor="sales-filter-payment">
                  {t("filters.paymentMethod") || "Ödeme Yöntemi"}
                </label>
                <select
                  id="sales-filter-payment"
                  value={salesPaymentMethod}
                  onChange={(e) => { setSalesPaymentMethod(e.target.value); }}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">{t("filters.all")}</option>
                  <option value="CASH">{paymentMethodLabel("CASH")}</option>
                  <option value="CARD">{paymentMethodLabel("CARD")}</option>
                  <option value="CREDIT">{paymentMethodLabel("CREDIT")}</option>
                  <option value="OTHER">{paymentMethodLabel("OTHER")}</option>
                </select>
              </div>
              <div className="flex min-w-[8rem] flex-col gap-1">
                <label className="text-sub font-ui-medium uppercase tracking-wide text-muted-foreground" htmlFor="sales-filter-terminal">
                  {tAdmin("pos.terminals") || "Terminal"}
                </label>
                <select
                  id="sales-filter-terminal"
                  value={salesTerminalId}
                  onChange={(e) => { setSalesTerminalId(e.target.value); }}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">{t("filters.all")}</option>
                  {terminalOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-[8rem] flex-col gap-1">
                <label className="text-sub font-ui-medium uppercase tracking-wide text-muted-foreground" htmlFor="sales-filter-user">
                  {tAdmin("users.title") || "Kullanıcı"}
                </label>
                <select
                  id="sales-filter-user"
                  value={salesCreatedById}
                  onChange={(e) => { setSalesCreatedById(e.target.value); }}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">{t("filters.all")}</option>
                  {(posUsersQuery.data || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name || u.last_name ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : u.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {t("salesListCard.totals") || "Toplam:"}
                <span className="font-ui-semibold text-foreground">
                  {formatAmount(salesTotals.net_total ?? 0, canViewAmounts)}
                </span>
                {salesFetching && <Loader2 className="size-3 animate-spin text-blue-500" />}
              </div>
              <div className="ml-auto">
                <Button variant="outline" size="sm" onClick={downloadSalesPdf} disabled={isExporting || sales.length === 0}>
                  {isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  <span className="ml-1.5">{t("export.button") || "PDF İndir"}</span>
                </Button>
              </div>
            </div>
          </div>

          <div ref={salesContainerRef} className="h-full max-h-[calc(100vh-20rem)] overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr className="border-b border-border dark:border-slate-700">
                  <th className="px-3 py-2 text-left font-ui-medium text-muted-foreground">{t("table.date")}</th>
                  <th className="px-3 py-2 text-left font-ui-medium text-muted-foreground">{t("table.orderNo")}</th>
                  <th className="px-3 py-2 text-left font-ui-medium text-muted-foreground">{t("table.payment")}</th>
                  <th className="px-3 py-2 text-right font-ui-medium text-muted-foreground">{t("table.total")}</th>
                  <th className="px-3 py-2 text-left font-ui-medium text-muted-foreground">{t("table.terminal")}</th>
                  <th className="px-3 py-2 text-center font-ui-medium text-muted-foreground">#</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ height: `${salesVirtualizer.getTotalSize()}px` }}>
                  <td colSpan={6} className="p-0">
                    <div style={{ position: "relative", height: `${salesVirtualizer.getTotalSize()}px` }}>
                      {virtualItems.map((vi) => {
                        const sale = sales[vi.index] as Sale & { order_number?: string; net_total?: string | number; terminal_name?: string; order_id?: string };
                        if (!sale) return null;
                        // Order detay modal'ı için order UUID'sini kullan.
                        // Sale tipinde alan adı `order` (Order FK), `order_id` değil.
                        const orderId = sale.order ?? sale.order_id ?? sale.id;
                        return (
                          <div
                            key={sale.id}
                            data-index={vi.index}
                            ref={salesVirtualizer.measureElement}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${vi.start}px)`,
                            }}
                          >
                            <div className="flex items-center border-b border-border/60 px-3 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                              <div className="flex-1 grid grid-cols-6 gap-2 items-center min-w-0">
                                <span className="truncate text-muted-foreground">
                                  {sale.created_at ? new Date(sale.created_at).toLocaleDateString("tr-TR") : "-"}
                                </span>
                                <span className="truncate font-ui-medium text-foreground">#{sale.order_number || sale.id}</span>
                                <span className="flex items-center gap-1 truncate">
                                  {paymentMethodIcon(sale.payment_method)}
                                  <span className="text-muted-foreground">{paymentMethodLabel(sale.payment_method)}</span>
                                </span>
                                <span className="text-right font-ui-semibold tabular-nums text-foreground">
                                  {formatAmount(sale.net_total ?? sale.total_amount, canViewAmounts)}
                                </span>
                                <span className="truncate text-muted-foreground">{sale.terminal_name || "-"}</span>
                                <div className="flex justify-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    onClick={() => setSelectedOrderId(orderId)}
                                  >
                                    <Eye className="size-3.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            {sales.length === 0 && !salesLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search className="size-8 mb-2 opacity-40" />
                <p className="text-sm">{t("salesListCard.empty") || "Kayıt bulunamadı"}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Sipariş Detay Modal */}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}>
        <DialogContent layout="scroll" size="3xl" className="max-h-[85vh]">
          {orderDetailQuery.isLoading ? (
            <DialogBody className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </DialogBody>
          ) : orderDetailQuery.data ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("orderDetail.title")}</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-4">
                {(() => {
                  const o = orderDetailQuery.data;
                  return (
                    <>
                      <DetailRow label={t("orderDetail.orderNo")}>{o.order_number || o.id}</DetailRow>
                      <DetailRow label={t("orderDetail.table")}>{o.table_name || "-"}</DetailRow>
                      <DetailRow label={t("orderDetail.payment")}>{paymentMethodLabel(o.payment_method)}</DetailRow>
                      <DetailRow label={t("orderDetail.total")} emphasized>
                        {formatAmount(
                          o.total_amount ??
                            o.net_total ??
                            o.total_price ??
                            (o.items as Array<{ total_price?: string | number }> | undefined)?.reduce(
                              (sum, item) => sum + Number(item.total_price ?? 0),
                              0,
                            ),
                          canViewAmounts,
                        )}
                      </DetailRow>
                      <div className="border-t pt-3">
                        <h3 className="mb-2 text-sm font-ui-semibold">{t("orderDetail.items")}</h3>
                        {(visibleOrderDetailItems(o.items as OrderDetailItem[])).map((item, idx) => (
                          <OrderDetailItemRow
                            key={item.id ?? `item-${idx}`}
                            item={item}
                            canViewAmounts={canViewAmounts}
                            combinedContentsLabel={t("orderDetail.combinedContents")}
                          />
                        ))}
                      </div>
                    </>
                  );
                })()}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedOrderId(null)}>
                  {t("orderDetail.close")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <DialogBody className="flex flex-col items-center justify-center py-12">
              <p className="text-center text-sm text-muted-foreground">{t("orderDetail.loadError")}</p>
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type OrderDetailCombinedPart = {
  product_name?: string;
  quantity_total?: number | string;
  unit_name?: string | null;
};

type OrderDetailItem = {
  id?: string;
  product_name?: string;
  quantity?: number | string;
  total_price?: string | number;
  parent_item?: string | null;
  status?: string;
  is_combined_product?: boolean;
  combined_parts?: OrderDetailCombinedPart[];
};

function visibleOrderDetailItems(items: OrderDetailItem[] | undefined): OrderDetailItem[] {
  if (!items?.length) return [];
  return items.filter((item) => !item.parent_item && item.status !== "CANCELLED");
}

function OrderDetailItemRow({
  item,
  canViewAmounts,
  combinedContentsLabel,
}: {
  item: OrderDetailItem;
  canViewAmounts: boolean;
  combinedContentsLabel: string;
}) {
  const parts = item.is_combined_product ? item.combined_parts ?? [] : [];

  return (
    <div className="border-b border-border/30 py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-foreground">
          {String(item.quantity ?? 0)}× {String(item.product_name ?? "")}
        </span>
        <span className="shrink-0 tabular-nums font-ui-medium text-foreground">
          {formatAmount(item.total_price ?? 0, canViewAmounts)}
        </span>
      </div>
      {parts.length > 0 ? (
        <div className="mt-1.5 pl-6">
          <p className="text-xs text-muted-foreground">{combinedContentsLabel}</p>
          <ul className="mt-1 space-y-0.5">
            {parts.map((part, partIdx) => (
              <li
                key={`${part.product_name ?? "part"}-${partIdx}`}
                className="text-xs text-muted-foreground"
              >
                {formatNumber(part.quantity_total ?? 0, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4,
                })}
                × {part.product_name}
                {part.unit_name ? ` (${part.unit_name})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  children,
  emphasized,
}: {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[120px_1fr] gap-2 ${emphasized ? "text-base font-ui-semibold" : ""}`}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="text-foreground min-w-0 break-words dark:text-slate-200">{children}</div>
    </div>
  );
}
