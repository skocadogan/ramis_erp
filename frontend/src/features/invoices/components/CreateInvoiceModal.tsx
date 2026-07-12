"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toastApiError } from "@/lib/operationalToast";
import { createInvoice } from "@/features/invoices/services/invoicesApi";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Sale } from "@/features/sales/types";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";

interface CreateInvoiceModalProps {
  sale: Sale | null;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateInvoiceModal({ sale, onClose, onCreated }: CreateInvoiceModalProps) {
  const t = useTranslations("invoices.createModal");
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const canViewAmounts = useCanViewAmounts();

  if (!sale) return null;

  const submit = async () => {
    setLoading(true);
    try {
      await createInvoice({
        sale_id: sale.id,
        customer_name: name,
        customer_tax_id: taxId,
        customer_address: address,
      });
      toast.success(t("toastSuccess"));
      onCreated?.();
      onClose();
    } catch (e) {
      toastApiError(e, t("toastError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
    >
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("saleLine", {
              id: sale.id.slice(0, 8),
              amount: formatAmount(sale.total_amount, canViewAmounts),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="invoice-customer-name">{t("placeholderName")}</Label>
            <Input
              id="invoice-customer-name"
              placeholder={t("placeholderName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-tax-id">{t("placeholderTaxId")}</Label>
            <Input
              id="invoice-tax-id"
              placeholder={t("placeholderTaxId")}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoice-address">{t("placeholderAddress")}</Label>
            <Textarea
              id="invoice-address"
              placeholder={t("placeholderAddress")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="min-h-0 resize-none"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {t("dismiss")}
          </Button>
          <Button type="button" disabled={loading} onClick={() => void submit()} className="gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
