"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { fetchPosCreditAccounts } from "../services/creditApi";
import type { CreditAccount } from "../types";

interface CreditPaymentModalProps {
  open: boolean;
  branchId: string;
  onClose: () => void;
  onSelect: (account: CreditAccount) => void;
}

export function CreditPaymentModal({ open, branchId, onClose, onSelect }: CreditPaymentModalProps) {
  const t = useTranslations("credit");
  const canViewAmounts = useCanViewAmounts();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["credit-pos-accounts", branchId],
    queryFn: () => fetchPosCreditAccounts(branchId),
    enabled: open && !!branchId,
  });

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={18} />
            {t("pos.modalTitle")}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("pos.noAccounts")}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedId(acc.id)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    selectedId === acc.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <div className="font-ui-semibold">{acc.full_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t("pos.balance")}: {formatAmount(acc.balance, canViewAmounts)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
                onClose();
              }
            }}
          >
            {t("pos.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
