"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toastApiError } from "@/lib/operationalToast";
import { adminApi } from "@/features/admin/services/adminApi";
import type { User } from "@/types/user.types";
import type { CreditAccount, CreditPolicy } from "../types";
import { createCreditAccount, fetchLinkedCreditUserIds, updateCreditAccount } from "../services/creditApi";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface CreditAccountFormModalProps {
  open: boolean;
  onClose: () => void;
  branchId: string;
  account: CreditAccount | null;
  onSaved: () => void;
}

const POLICIES: CreditPolicy[] = ["BLOCK", "WARN_ALLOW", "OPEN_TAB"];

function formatUserOptionLabel(user: User): string {
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  if (name) return `${name} (${user.username})`;
  return user.username;
}

export function CreditAccountFormModal({
  open,
  onClose,
  branchId,
  account,
  onSaved,
}: CreditAccountFormModalProps) {
  const t = useTranslations("credit");
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>("BLOCK");

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["credit-form-users", branchId],
    queryFn: async () => {
      const results = await adminApi.fetchAllUsers({ is_active: true });
      return results;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: linkedUserIds = [] } = useQuery({
    queryKey: ["credit-linked-users", branchId],
    queryFn: () => fetchLinkedCreditUserIds(branchId),
    enabled: open,
    staleTime: 60_000,
  });

  const selectableUsers = useMemo(() => {
    const taken = new Set(
      linkedUserIds.filter((id) => id !== (account?.user ?? "")),
    );
    return users.filter((u) => !taken.has(u.id));
  }, [users, linkedUserIds, account?.user]);

  useEffect(() => {
    if (!open) return;
    setSelectedUserId(account?.user ?? "");
    setFirstName(account?.first_name ?? "");
    setLastName(account?.last_name ?? "");
    setPhone(account?.phone ?? "");
    setEmail(account?.email ?? "");
    setAddress(account?.address ?? "");
    setNotes(account?.notes ?? "");
    setIsGlobal(account?.is_global ?? false);
    setCreditPolicy(account?.credit_policy ?? "BLOCK");
  }, [open, account]);

  const handleUserChange = useCallback(
    (value: string) => {
      setSelectedUserId(value);
      if (!value) return;
      const user = users.find((u) => u.id === value);
      if (!user) return;
      setFirstName(user.first_name ?? "");
      setLastName(user.last_name ?? "");
      setEmail(user.email ?? "");
    },
    [users],
  );

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone,
        email,
        address,
        notes,
        is_global: isGlobal,
        credit_policy: creditPolicy,
        branch: isGlobal ? null : branchId,
        user: selectedUserId || null,
      };
      if (account) {
        await updateCreditAccount(account.id, payload);
        toast.success(t("toast.updated"));
      } else {
        await createCreditAccount(payload);
        toast.success(t("toast.created"));
      }
      onSaved();
      onClose();
    } catch (e) {
      toastApiError(e, t("toast.operationFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="lg">
        <DialogHeader>
          <DialogTitle>{account ? t("form.editTitle") : t("form.createTitle")}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="credit-form-user">{t("form.systemUser")}</Label>
            <div className="relative">
              <select
                id="credit-form-user"
                value={selectedUserId}
                onChange={(e) => handleUserChange(e.target.value)}
                disabled={usersLoading}
                className={selectClass}
              >
                <option value="">{t("form.systemUserNone")}</option>
                {selectableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {formatUserOptionLabel(user)}
                  </option>
                ))}
              </select>
              {usersLoading && (
                <Loader2
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )}
            </div>
            {!usersLoading && selectableUsers.length === 0 && !selectedUserId && (
              <p className="text-xs text-muted-foreground">{t("form.noUsersAvailable")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="credit-form-first-name">{t("form.firstName")}</Label>
              <Input
                id="credit-form-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="credit-form-last-name">{t("form.lastName")}</Label>
              <Input
                id="credit-form-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-form-phone">{t("form.phone")}</Label>
            <Input
              id="credit-form-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-form-email">{t("form.email")}</Label>
            <Input
              id="credit-form-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-form-address">{t("form.address")}</Label>
            <Textarea
              id="credit-form-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="min-h-0 resize-none"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-form-notes">{t("form.notes")}</Label>
            <Textarea
              id="credit-form-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="min-h-0 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="credit-form-global"
              checked={isGlobal}
              onCheckedChange={(checked) => setIsGlobal(checked === true)}
            />
            <Label htmlFor="credit-form-global" className="cursor-pointer font-normal">
              {t("form.isGlobal")}
            </Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="credit-form-policy">{t("form.creditPolicy")}</Label>
            <select
              id="credit-form-policy"
              value={creditPolicy}
              onChange={(e) => setCreditPolicy(e.target.value as CreditPolicy)}
              className={selectClass}
            >
              {POLICIES.map((p) => (
                <option key={p} value={p}>
                  {t(`policy.${p}`)}
                </option>
              ))}
            </select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t("form.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !firstName.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
