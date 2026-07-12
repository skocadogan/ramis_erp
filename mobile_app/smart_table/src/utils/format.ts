// ============================================================
// Format Utilities — Smart Table
// Price formatting, relative dates, status helpers
// ============================================================

/**
 * Format a number as price string (tr-TR locale).
 * Examples: 1250 → "1.250", 26.75 → "26,75"
 */
export const formatPrice = (price: number): string => {
  if (!Number.isFinite(price)) return "0";
  return price.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

/** Sepet / sipariş ekstra etiketi — fiyat varsa "Acı (+20)" biçiminde. */
export function formatModifierDisplayName(
  mod: { modifierName: string; groupName: string; price: number },
  language: "tr" | "en",
): string {
  const name =
    language === "tr" ? mod.modifierName : mod.groupName || mod.modifierName;
  if (mod.price > 0) {
    return `${name} (+${formatPrice(mod.price)})`;
  }
  return name;
}

/** Sepet satış birimi etiketi — fark varsa "1,5 Porsiyon (+30)" biçiminde. */
export function formatUnitDisplayName(
  unit: { name: string; nameEn: string },
  language: "tr" | "en",
  unitPremium: number,
): string {
  const name = language === "tr" ? unit.name : unit.nameEn || unit.name;
  if (unitPremium > 0) {
    return `${name} (+${formatPrice(unitPremium)})`;
  }
  return name;
}

/**
 * Return a human-readable relative time string in Turkish.
 * Examples: "5 dk önce", "1 saat önce", "2 gün önce"
 */
export const formatDate = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Az önce";
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Return a human-readable relative time string in English.
 * Examples: "5 min ago", "1 hour ago", "2 days ago"
 */
export const formatDateEn = (dateStr: string): string => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Return the appropriate hex color for each order status.
 */
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    PENDING: "#F59E0B",
    CONFIRMED: "#3B82F6",
    PREPARING: "#8B5CF6",
    READY: "#059669",
    DELIVERED: "#6B7280",
    COMPLETED: "#6B7280",
    CANCELLED: "#EF4444",
  };
  return colors[status] ?? "#6B7280";
};

import type { CustomerOrderDisplayStatus } from "./customerOrderStatus";

/**
 * Müşteri ekranı (Siparişlerim) için durum etiketi.
 */
export const getCustomerStatusLabel = (
  status: CustomerOrderDisplayStatus,
  lang: "tr" | "en",
): string => {
  const labels: Record<CustomerOrderDisplayStatus, { tr: string; en: string }> =
    {
      SENT_TO_KITCHEN: { tr: "Mutfağa İletildi", en: "Sent to Kitchen" },
      PREPARING: { tr: "Hazırlanıyor", en: "Preparing" },
      PREPARED: { tr: "Hazırlandı", en: "Prepared" },
      ON_THE_WAY: {
        tr: "Masanıza Getirilecek",
        en: "On the Way to Your Table",
      },
      DELIVERED: { tr: "Teslim Edildi", en: "Delivered" },
      COMPLETED: { tr: "Tamamlandı", en: "Completed" },
      CANCELLED: { tr: "İptal Edildi", en: "Cancelled" },
    };
  return labels[status]?.[lang] ?? status;
};

export const getCustomerStatusBadgeColors = (
  status: CustomerOrderDisplayStatus,
): { bg: string; text: string } => {
  const colors: Record<
    CustomerOrderDisplayStatus,
    { bg: string; text: string }
  > = {
    SENT_TO_KITCHEN: { bg: "#DBEAFE", text: "#1E40AF" },
    PREPARING: { bg: "#F3E8FF", text: "#6B21A8" },
    PREPARED: { bg: "#D1FAE5", text: "#065F46" },
    ON_THE_WAY: { bg: "#FEF3C7", text: "#92400E" },
    DELIVERED: { bg: "#F3F4F6", text: "#374151" },
    COMPLETED: { bg: "#F3F4F6", text: "#374151" },
    CANCELLED: { bg: "#FEE2E2", text: "#991B1B" },
  };
  return colors[status] ?? { bg: "#F3F4F6", text: "#374151" };
};

export const getCustomerStatusColor = (
  status: CustomerOrderDisplayStatus,
): string => {
  const colors: Record<CustomerOrderDisplayStatus, string> = {
    SENT_TO_KITCHEN: "#3B82F6",
    PREPARING: "#8B5CF6",
    PREPARED: "#059669",
    ON_THE_WAY: "#F59E0B",
    DELIVERED: "#6B7280",
    COMPLETED: "#6B7280",
    CANCELLED: "#EF4444",
  };
  return colors[status] ?? "#6B7280";
};

/**
 * Format estimated completion time to a readable remaining time.
 */
export const formatEstimatedTime = (
  estimatedStr: string,
  lang: "tr" | "en",
): string => {
  const now = new Date();
  const estimated = new Date(estimatedStr);
  const diffMs = estimated.getTime() - now.getTime();
  const diffMins = Math.ceil(diffMs / 60000);

  if (diffMins <= 0) {
    return lang === "tr" ? "Hemen hazır" : "Ready now";
  }

  if (diffMins < 60) {
    return lang === "tr" ? `~${diffMins} dk` : `~${diffMins} min`;
  }

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (lang === "tr") {
    return mins > 0 ? `~${hours} saat ${mins} dk` : `~${hours} saat`;
  }
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
};
