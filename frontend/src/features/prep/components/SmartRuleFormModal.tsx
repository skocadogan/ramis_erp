"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/store/useAuthStore";
import { prepApi } from "../services/prepApi";
import { PrepSmartRule } from "../types";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<PrepSmartRule>) => Promise<void>;
  isLoading: boolean;
  branchId: string;
  /** Tam kayıt düzenlemede id dolu; keşif ön-doldurmada id yok (oluşturma). */
  initialData?: (PrepSmartRule | Partial<PrepSmartRule>) | null;
}

const fieldSelectClassName =
  "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function SmartRuleFormModal({ open, onClose, onSave, isLoading, branchId, initialData }: Props) {
  const t = useTranslations("prep");
  const user = useAuthStore((s) => s.user);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);

  const [formData, setFormData] = useState<Partial<PrepSmartRule>>({
    title: "",
    branch: "",
    base_product: "",
    target_item: "",
    ratio: 1,
    unit: "ADET",
    is_active: true,
  });

  useEffect(() => {
    const targetBranchId = branchId || user?.branch_id;
    if (open && targetBranchId) {
      setIsFetchingProducts(true);
      prepApi.getProducts(targetBranchId)
        .then(setProducts)
        .finally(() => setIsFetchingProducts(false));
    }
  }, [open, branchId, user]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        title: "",
        branch: branchId || user?.branch_id || "",
        base_product: "",
        target_item: "",
        ratio: 1,
        unit: "ADET",
        is_active: true,
      });
    }
  }, [initialData, open, branchId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent size="md">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-lg font-bold uppercase tracking-tight">
            {initialData && "id" in initialData && initialData.id ? t("smartRuleModal.editTitle") : t("smartRuleModal.createTitle")}
          </DialogTitle>
          <div className="flex items-center gap-2 pr-6">
            <Label htmlFor="is_active" className="text-2xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.enabled")}</Label>
            <Switch 
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </DialogHeader>

        <form id="smart-rule-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.ruleTitle")}</Label>
              <Input
                id="title"
                required
                placeholder={t("smartRuleModal.titlePlaceholder")}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="base_product" className="text-xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.baseProduct")}</Label>
              <select
                id="base_product"
                required
                value={formData.base_product || ""}
                onChange={(e) => setFormData({ ...formData, base_product: e.target.value })}
                className={fieldSelectClassName}
              >
                <option value="">{t("smartRuleModal.selectProduct")}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {isFetchingProducts && <p className="text-2xs text-purple-500/70">{t("smartRuleModal.productsLoading")}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="target_item" className="text-xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.targetItem")}</Label>
              <Input
                id="target_item"
                required
                placeholder={t("smartRuleModal.targetPlaceholder")}
                value={formData.target_item}
                onChange={(e) => setFormData({ ...formData, target_item: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.ratio")}</Label>
                <Input
                  type="number"
                  required
                  step="0.001"
                  value={formData.ratio}
                  onChange={(e) => setFormData({ ...formData, ratio: parseFloat(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">{t("smartRuleModal.unit")}</Label>
                <Input
                  placeholder={t("smartRuleModal.unitPlaceholder")}
                  value={formData.unit || ""}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>{t("smartRuleModal.cancel")}</Button>
          <Button type="submit" form="smart-rule-form" disabled={isLoading}>
            {isLoading
              ? t("smartRuleModal.saving")
              : initialData && "id" in initialData && initialData.id
                ? t("smartRuleModal.update")
                : t("smartRuleModal.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
