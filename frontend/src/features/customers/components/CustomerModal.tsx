"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { customersApi } from "../services/customersApi";
import type { Customer, CustomerType } from "../types";
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast";

interface CustomerModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerModal({ customer, onClose, onSuccess }: CustomerModalProps) {
  const t = useTranslations("customers");
  const isEdit = !!customer;

  const [customerType, setCustomerType] = useState<CustomerType>("INDIVIDUAL");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [webAddress, setWebAddress] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [mersisNo, setMersisNo] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (customer) {
      setCustomerType(customer.customer_type);
      setName(customer.name || "");
      setAddress(customer.address || "");
      setPhone(customer.phone || "");
      setEmail(customer.email || "");
      setWebAddress(customer.web_address || "");
      setTaxOffice(customer.tax_office || "");
      setTaxNo(customer.tax_no || "");
      setTcNo(customer.tc_no || "");
      setMersisNo(customer.mersis_no || "");
    }
  }, [customer]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = "İsim veya Firma Unvanı zorunludur";
    }
    if (customerType === "INDIVIDUAL" && tcNo && tcNo.length !== 11) {
      newErrors.tcNo = "T.C. Kimlik Numarası 11 haneli olmalıdır";
    }
    if (customerType === "CORPORATE" && taxNo && taxNo.length !== 10 && taxNo.length !== 11) {
      newErrors.taxNo = "Vergi Numarası 10 veya 11 haneli olmalıdır";
    }
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Geçersiz e-posta adresi";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    const payload: Partial<Customer> = {
      customer_type: customerType,
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      web_address: customerType === "CORPORATE" ? webAddress.trim() : "",
      tax_office: customerType === "CORPORATE" ? taxOffice.trim() : "",
      tax_no: customerType === "CORPORATE" ? taxNo.trim() : "",
      tc_no: customerType === "INDIVIDUAL" ? tcNo.trim() : "",
      mersis_no: customerType === "CORPORATE" ? mersisNo.trim() : "",
    };

    try {
      if (isEdit && customer) {
        await customersApi.updateCustomer(customer.id, payload);
        toastApiSuccess(t("messages.updateSuccess"));
      } else {
        await customersApi.createCustomer(payload);
        toastApiSuccess(t("messages.createSuccess"));
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      toastApiError(err, "Müşteri kaydedilemedi");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isSubmitting) onClose();
      }}
    >
      <DialogContent layout="scroll" size="lg" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("addNew")}</DialogTitle>
        </DialogHeader>

        <form id="customer-form" onSubmit={handleSubmit}>
          <DialogBody className="space-y-5">
            <div className="grid gap-2">
              <Label>{t("customerType")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["INDIVIDUAL", "CORPORATE"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCustomerType(type)}
                    className={cn(
                      "rounded-lg border py-2 text-sm font-ui-semibold transition-colors",
                      customerType === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t(`types.${type}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customer-name">
                {customerType === "CORPORATE" ? "Firma Unvanı" : "Adı Soyadı"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={customerType === "CORPORATE" ? "Örn: Ramis A.Ş." : "Örn: Ahmet Yılmaz"}
                aria-invalid={!!errors.name}
                className={cn(errors.name && "border-destructive")}
              />
              {errors.name && <p className="text-2xs text-destructive">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer-phone">{t("fields.phone")}</Label>
                <Input
                  id="customer-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Örn: 0555 123 4567"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-email">{t("fields.email")}</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Örn: mail@example.com"
                  aria-invalid={!!errors.email}
                  className={cn(errors.email && "border-destructive")}
                />
                {errors.email && <p className="text-2xs text-destructive">{errors.email}</p>}
              </div>
            </div>

            {customerType === "INDIVIDUAL" && (
              <div className="grid gap-2">
                <Label htmlFor="customer-tc">{t("fields.tcNo")}</Label>
                <Input
                  id="customer-tc"
                  type="text"
                  maxLength={11}
                  value={tcNo}
                  onChange={(e) => setTcNo(e.target.value.replace(/\D/g, ""))}
                  placeholder="Örn: 12345678901"
                  aria-invalid={!!errors.tcNo}
                  className={cn(errors.tcNo && "border-destructive")}
                />
                {errors.tcNo && <p className="text-2xs text-destructive">{errors.tcNo}</p>}
              </div>
            )}

            {customerType === "CORPORATE" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customer-tax-office">{t("fields.taxOffice")}</Label>
                    <Input
                      id="customer-tax-office"
                      type="text"
                      value={taxOffice}
                      onChange={(e) => setTaxOffice(e.target.value)}
                      placeholder="Örn: Kadıköy V.D."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customer-tax-no">{t("fields.taxNo")}</Label>
                    <Input
                      id="customer-tax-no"
                      type="text"
                      maxLength={11}
                      value={taxNo}
                      onChange={(e) => setTaxNo(e.target.value.replace(/\D/g, ""))}
                      placeholder="Örn: 1234567890"
                      aria-invalid={!!errors.taxNo}
                      className={cn(errors.taxNo && "border-destructive")}
                    />
                    {errors.taxNo && <p className="text-2xs text-destructive">{errors.taxNo}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customer-mersis">{t("fields.mersisNo")}</Label>
                    <Input
                      id="customer-mersis"
                      type="text"
                      value={mersisNo}
                      onChange={(e) => setMersisNo(e.target.value)}
                      placeholder="Örn: 0123456789012345"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customer-web">{t("fields.webAddress")}</Label>
                    <Input
                      id="customer-web"
                      type="text"
                      value={webAddress}
                      onChange={(e) => setWebAddress(e.target.value)}
                      placeholder="Örn: https://www.firma.com"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="customer-address">{t("fields.address")}</Label>
              <Textarea
                id="customer-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Açık adres..."
                rows={3}
                className="min-h-0 resize-none"
              />
            </div>
          </DialogBody>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button type="submit" form="customer-form" disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 size={15} className="animate-spin" />}
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
