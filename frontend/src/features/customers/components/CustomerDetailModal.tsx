"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FileDown, Globe, Phone, Mail, MapPin, Building, User, Loader2 } from "lucide-react";
import { customersApi } from "../services/customersApi";
import type { Customer, CustomerSalesTotals, CustomerOrderDetail } from "../types";
import { useLocalizedFormatters } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { CustomerSalesTable } from "./CustomerSalesTable";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
}

const SALES_PAGE_SIZE = 40;

const EMPTY_TOTALS: CustomerSalesTotals = {
  gross_total: 0,
  discount_total: 0,
  net_total: 0,
};

function parseNextPage(next: string | null | undefined): number | undefined {
  if (!next) return undefined;
  try {
    const url = new URL(next, "http://local");
    const page = url.searchParams.get("page");
    return page ? parseInt(page, 10) : undefined;
  } catch {
    return undefined;
  }
}

export function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const t = useTranslations("customers");
  const { formatCurrency, formatDate } = useLocalizedFormatters();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const {
    data: salesPages,
    isLoading: salesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["customer-sales", customer.id],
    queryFn: ({ pageParam }) =>
      customersApi.getCustomerSales(customer.id, {
        page: typeof pageParam === "number" ? pageParam : 1,
        page_size: SALES_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => parseNextPage(lastPage.next),
    initialPageParam: 1,
  });

  const sales = useMemo(
    () => salesPages?.pages.flatMap((page) => page.results) ?? [],
    [salesPages],
  );

  const totalCount = salesPages?.pages[0]?.count ?? 0;
  const totals = salesPages?.pages[0]?.totals ?? EMPTY_TOTALS;

  const orderDetailQuery = useQuery({
    queryKey: ["order-detail", selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return null;
      const res = await api.get<CustomerOrderDetail>(`/orders/main/${selectedOrderId}/`);
      return res.data;
    },
    enabled: !!selectedOrderId,
  });

  const handleExportSalesExcel = async () => {
    try {
      const blob = await customersApi.exportCustomerSalesExcel(customer.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `musteri_satis_${customer.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportSalesPdf = async () => {
    try {
      const blob = await customersApi.exportCustomerSalesPdf(customer.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `musteri_satis_${customer.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error(e);
    }
  };

  const infoLabelClass = "text-xs text-muted-foreground mb-0.5 font-semibold block";
  const infoValClass = "text-sm text-foreground font-medium break-words block";

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent layout="scroll" size="5xl" className="max-h-[85vh]">
          <DialogHeader className="pr-12">
            <div className="flex items-center gap-2.5">
              <DialogTitle>{t("detailTitle")}</DialogTitle>
              <Badge variant={customer.customer_type === "CORPORATE" ? "secondary" : "outline"}>
                {t(`types.${customer.customer_type}`)}
              </Badge>
            </div>
          </DialogHeader>

          <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left Side: Customer Info Card */}
          <div className="w-full shrink-0 space-y-6 overflow-y-auto border-b border-border bg-muted/20 p-6 lg:w-80 lg:border-b-0 lg:border-e">
            <div className="flex flex-col items-center border-b border-border pb-4 text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {customer.customer_type === "CORPORATE" ? (
                  <Building size={28} />
                ) : (
                  <User size={28} />
                )}
              </div>
              <h4 className="text-base font-bold text-foreground leading-tight">{customer.name}</h4>
              <span className="text-xs text-muted-foreground mt-1">
                Kayıt Tarihi: {formatDate(customer.created_at, { dateStyle: "medium" })}
              </span>
            </div>

            {/* General Info */}
            <div className="space-y-4">
              {customer.phone && (
                <div className="flex gap-3">
                  <Phone size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className={infoLabelClass}>{t("fields.phone")}</span>
                    <span className={infoValClass}>{customer.phone}</span>
                  </div>
                </div>
              )}

              {customer.email && (
                <div className="flex gap-3">
                  <Mail size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className={infoLabelClass}>{t("fields.email")}</span>
                    <span className={infoValClass}>{customer.email}</span>
                  </div>
                </div>
              )}

              {customer.customer_type === "INDIVIDUAL" && customer.tc_no && (
                <div className="flex gap-3">
                  <User size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className={infoLabelClass}>{t("fields.tcNo")}</span>
                    <span className={infoValClass}>{customer.tc_no}</span>
                  </div>
                </div>
              )}

              {customer.customer_type === "CORPORATE" && (
                <>
                  {customer.tax_office && (
                    <div className="flex gap-3">
                      <Building size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className={infoLabelClass}>{t("fields.taxOffice")}</span>
                        <span className={infoValClass}>{customer.tax_office}</span>
                      </div>
                    </div>
                  )}

                  {customer.tax_no && (
                    <div className="flex gap-3">
                      <Building size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className={infoLabelClass}>{t("fields.taxNo")}</span>
                        <span className={infoValClass}>{customer.tax_no}</span>
                      </div>
                    </div>
                  )}

                  {customer.mersis_no && (
                    <div className="flex gap-3">
                      <Building size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className={infoLabelClass}>{t("fields.mersisNo")}</span>
                        <span className={infoValClass}>{customer.mersis_no}</span>
                      </div>
                    </div>
                  )}

                  {customer.web_address && (
                    <div className="flex gap-3">
                      <Globe size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className={infoLabelClass}>{t("fields.webAddress")}</span>
                        <a
                          href={customer.web_address}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium break-all block"
                        >
                          {customer.web_address}
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}

              {customer.address && (
                <div className="flex gap-3">
                  <MapPin size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className={infoLabelClass}>{t("fields.address")}</span>
                    <span className={infoValClass}>{customer.address}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Sales History */}
          <div className="flex min-h-[min(420px,50vh)] flex-1 flex-col overflow-hidden p-6 lg:min-h-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">
                {t("sales.title")} ({totalCount})
              </h4>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportSalesExcel}
                  disabled={sales.length === 0}
                  className="gap-1.5 text-xs"
                >
                  <FileDown size={14} />
                  {t("messages.exportExcel")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportSalesPdf}
                  disabled={sales.length === 0}
                  className="gap-1.5 text-xs"
                >
                  <FileDown size={14} />
                  {t("messages.exportPdf")}
                </Button>
              </div>
            </div>

            {/* Totals Summary Widgets */}
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("sales.totalGross")}
                </span>
                <span className="mt-1 block text-sm font-bold text-foreground">
                  {formatCurrency(totals.gross_total)}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("sales.totalDiscount")}
                </span>
                <span className="mt-1 block text-sm font-bold text-rose-600">
                  {formatCurrency(totals.discount_total)}
                </span>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <span className="block text-2xs font-semibold uppercase tracking-wider text-primary">
                  {t("sales.totalNet")}
                </span>
                <span className="mt-1 block text-sm font-bold text-primary">
                  {formatCurrency(totals.net_total)}
                </span>
              </div>
            </div>

            {/* Sales Table */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
              {salesLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : sales.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t("sales.empty")}
                </div>
              ) : (
                <CustomerSalesTable
                  sales={sales}
                  onSaleClick={setSelectedOrderId}
                  infiniteControls={{
                    fetchNextPage,
                    hasNextPage: !!hasNextPage,
                    isFetchingNextPage,
                  }}
                />
              )}
            </div>
          </div>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Sipariş Detay */}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }}>
        <DialogContent layout="scroll" size="3xl" className="max-h-[85vh]">
          {orderDetailQuery.isLoading ? (
            <DialogBody className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </DialogBody>
          ) : orderDetailQuery.data ? (
            <>
              <DialogHeader>
                <DialogTitle>Sipariş Detayı</DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-4 text-sm">
                {(() => {
                  const o = orderDetailQuery.data;
                  return (
                    <>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <span className="text-muted-foreground">Sipariş No:</span>
                        <span className="font-mono font-semibold text-foreground">{o.order_number || o.id}</span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <span className="text-muted-foreground">Masa / Alan:</span>
                        <span className="text-foreground">{o.table_name || "—"}</span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <span className="text-muted-foreground">Ödeme Yöntemi:</span>
                        <span className="text-foreground">{o.payment_method_display || o.payment_method || "—"}</span>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2 text-base font-semibold">
                        <span className="text-muted-foreground">Net Tutar:</span>
                        <span className="text-primary">{formatCurrency(o.net_total ?? o.total_price ?? 0)}</span>
                      </div>
                      <div className="border-t border-border pt-3">
                        <h3 className="mb-2 text-sm font-semibold">Sipariş Edilen Ürünler</h3>
                        {(o.items || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between border-b border-border/30 py-1 text-sm">
                            <span>{item.quantity}x {item.product_name}</span>
                            <span className="tabular-nums font-semibold">{formatCurrency(item.total_price)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedOrderId(null)}>
                  Kapat
                </Button>
              </DialogFooter>
            </>
          ) : (
            <DialogBody className="flex flex-col items-center justify-center py-12">
              <p className="text-center text-sm text-muted-foreground">Sipariş detayları yüklenemedi.</p>
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
