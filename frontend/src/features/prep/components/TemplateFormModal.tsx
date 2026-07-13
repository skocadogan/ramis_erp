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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { User, Type } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { prepApi } from "../services/prepApi";
import { PrepTemplate } from "../types";

import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<PrepTemplate>) => Promise<void>;
  isLoading: boolean;
  branchId: string;
  initialData?: PrepTemplate | null;
}

const DAY_IDS = [
  { id: "every_monday" as const, dayKey: "mon" as const },
  { id: "every_tuesday" as const, dayKey: "tue" as const },
  { id: "every_wednesday" as const, dayKey: "wed" as const },
  { id: "every_thursday" as const, dayKey: "thu" as const },
  { id: "every_friday" as const, dayKey: "fri" as const },
  { id: "every_saturday" as const, dayKey: "sat" as const },
  { id: "every_sunday" as const, dayKey: "sun" as const },
];

const fieldSelectClassName =
  "flex h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function TemplateFormModal({ open, onClose, onSave, isLoading, branchId, initialData }: Props) {
  const t = useTranslations("prep");
  const user = useAuthStore((s) => s.user);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [branchUsers, setBranchUsers] = useState<{ id: string; username: string; first_name: string; last_name: string }[]>([]);
  const [isFetchingStations, setIsFetchingStations] = useState(false);

  const [formData, setFormData] = useState<Partial<PrepTemplate>>({
    title: "",
    description: "",
    branch: "",
    station: "",
    assigned_to: null,
    target_quantity: 1,
    unit: "ADET",
    activation_time: "06:00",
    every_monday: true,
    every_tuesday: true,
    every_wednesday: true,
    every_thursday: true,
    every_friday: true,
    every_saturday: true,
    every_sunday: true,
    is_enabled: true,
  });

  // Fetch branches if superuser
  useEffect(() => {
    if (open && user?.is_superuser) {
      prepApi.getBranches()
        .then(setBranches);
    } else if (open && user?.available_branches) {
      setBranches(user.available_branches);
    }
  }, [open, user]);

  // Fetch stations when branch changes
  useEffect(() => {
    const targetBranchId = formData.branch || branchId;
    if (open && targetBranchId) {
      setIsFetchingStations(true);
      prepApi.getStations(targetBranchId)
        .then(setStations)
        .finally(() => setIsFetchingStations(false));
      prepApi.getBranchUsers(targetBranchId)
        .then(setBranchUsers)
        .catch(() => setBranchUsers([]));
    } else {
      setStations([]);
      setBranchUsers([]);
    }
  }, [open, formData.branch, branchId]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        title: "",
        description: "",
        branch: branchId,
        station: "",
        assigned_to: null,
        target_quantity: 1,
        unit: "ADET",
        activation_time: "06:00",
        every_monday: true,
        every_tuesday: true,
        every_wednesday: true,
        every_thursday: true,
        every_friday: true,
        every_saturday: true,
        every_sunday: true,
        is_enabled: true,
      });
    }
  }, [initialData, open, branchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const showBranchSelect = user?.is_superuser || (user?.available_branches && user.available_branches.length > 1);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent size="md">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-lg font-bold uppercase tracking-tight">
            {initialData ? t("templateModal.editTitle") : t("templateModal.createTitle")}
          </DialogTitle>
          <div className="flex items-center gap-2 pr-6">
            <Label htmlFor="is_enabled" className="text-2xs font-bold uppercase text-muted-foreground">{t("templateModal.enabled")}</Label>
            <Switch 
              id="is_enabled"
              checked={formData.is_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
            />
          </div>
        </DialogHeader>

        <form id="template-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {showBranchSelect && (
              <div className="grid gap-2">
                <Label htmlFor="branch" className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.branch")}</Label>
                <select
                  id="branch"
                  required
                  value={formData.branch || ""}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value, station: "" })}
                  className={fieldSelectClassName}
                >
                  <option value="">{t("templateModal.selectBranch")}</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="station" className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.station")}</Label>
              <select
                id="station"
                value={formData.station || ""}
                onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                className={fieldSelectClassName}
              >
                <option value="">{t("templateModal.noStation")}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {isFetchingStations && <p className="text-2xs text-blue-500/70">{t("templateModal.stationsLoading")}</p>}
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.assignedTo")}</Label>
              {/* Sistem kullanıcı seçimi */}
              <div className="flex items-center gap-2">
                <User size={14} className="shrink-0 text-muted-foreground" />
                <select
                  value={formData.display_name ? "" : (formData.assigned_to || "")}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value || null, display_name: "" })}
                  className={`${fieldSelectClassName} flex-1 min-w-0`}
                >
                  <option value="">{t("templateModal.assignedToEveryone")}</option>
                  {branchUsers.map((u) => {
                    const fullName = `${u.first_name} ${u.last_name}`.trim();
                    return (
                      <option key={u.id} value={u.id}>
                        {fullName || u.username}
                      </option>
                    );
                  })}
                </select>
              </div>
              {/* Sisteme kayıtlı olmayan kişi için manuel isim girişi */}
              <div className="flex items-center gap-2">
                <Type size={14} className="shrink-0 text-muted-foreground" />
                <Input
                  placeholder={t("templateModal.namePlaceholder") || "İsim yazın..."}
                  value={formData.display_name || ""}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value, assigned_to: e.target.value ? null : formData.assigned_to })}
                  className="flex-1 h-10"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="title" className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.templateName")}</Label>
              <Input
                id="title"
                required
                placeholder={t("templateModal.titlePlaceholder")}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.targetQty")}</Label>
                <Input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  value={formData.target_quantity}
                  onChange={(e) => setFormData({ ...formData, target_quantity: parseFloat(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.unit")}</Label>
                <Input
                  placeholder={t("templateModal.unitPlaceholder")}
                  value={formData.unit || ""}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.activationTime")}</Label>
              <Input
                type="time"
                required
                value={formData.activation_time}
                onChange={(e) => setFormData({ ...formData, activation_time: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase text-muted-foreground">{t("templateModal.validDays")}</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_IDS.map((day) => (
                  <div key={day.id} className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1.5">
                    <Checkbox
                      id={day.id}
                      checked={formData[day.id as keyof PrepTemplate] as boolean}
                      onCheckedChange={(checked) => setFormData({ ...formData, [day.id]: !!checked })}
                    />
                    <label htmlFor={day.id} className="text-2xs font-bold uppercase cursor-pointer select-none">
                      {t(`templateModal.days.${day.dayKey}`)}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>{t("templateModal.cancel")}</Button>
          <Button type="submit" form="template-form" disabled={isLoading}>
            {isLoading ? t("templateModal.saving") : (initialData ? t("templateModal.update") : t("templateModal.create"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
