"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Loader2, User, Building } from "lucide-react";
import { customersApi } from "../services/customersApi";
import type { Customer } from "../types";
import { Badge } from "@/components/ui/badge";

interface CustomerSelectModalProps {
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}

export function CustomerSelectModal({ onClose, onSelect }: CustomerSelectModalProps) {
  const t = useTranslations("customers");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const data = await customersApi.getCustomers({
          search: debouncedSearch,
          page_size: 50,
        });
        setCustomers(data.results || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, [debouncedSearch]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden border border-border flex flex-col max-h-[80vh] bg-card border-border animate-in fade-in zoom-in-95 duration-155">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Müşteri Seç</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover: dark:hover: transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Müşteri adı, telefon veya e-posta ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-border text-foreground"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : customers.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground">
              Müşteri kaydı bulunamadı.
            </div>
          ) : (
            <div className="space-y-1">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover: dark:hover: text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold bg-muted text-muted-foreground">
                      {c.customer_type === "CORPORATE" ? (
                        <Building size={14} />
                      ) : (
                        <User size={14} />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground leading-tight">
                        {c.name}
                      </h4>
                      <span className="text-2xs text-muted-foreground mt-0.5 block">
                        {c.phone || "Telefon yok"} • {c.email || "E-posta yok"}
                      </span>
                    </div>
                  </div>
                  <Badge variant={c.customer_type === "CORPORATE" ? "secondary" : "outline"} className="text-3xs px-1.5 py-0.5">
                    {t(`types.${c.customer_type}`)}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
