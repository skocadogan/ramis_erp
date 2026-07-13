"use client";

import React from "react";
import { CartItem, ProductModifier } from "@/types/pos";
import { Utensils, CheckCircle2, ChevronRight, CreditCard, Banknote, Sparkles, Loader2, MoreHorizontal, Wallet, ShieldAlert } from "lucide-react";
import { CustomerDisplayIdle } from "./CustomerDisplayIdle";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { useTranslations } from "next-intl";
import { productHasAllergens } from "@/features/pos/utils/displayAllergenModal";
import { formatProductCalories } from "@/features/pos/utils/formatProductCalories";

interface CustomerDisplayViewProps {
  /** Müşteri ekranı URL'inde ?branch_id= — ayar ve slaytlar için zorunlu */
  branchId?: string;
  /** URL segment / WS kanal kodu — terminal bazlı müşteri ekranı ayarları için */
  terminalCode?: string;
  cart: CartItem[];
  total: number;
  table: { name: string; number: number } | null;
  metadata?: {
    isPaymentMode: boolean;
    paymentMethod: string | null;
    isProcessing: boolean;
  };
  successSignal?: 'ORDER' | 'PAYMENT' | null;
  onSuccessSignalComplete?: () => void;
  timestamp?: string;
  /** Seçenek/allerjen modalı açıkken boş sepette IDLE yerine sipariş kabuğu */
  keepOrderShell?: boolean;
}

interface DisplaySettings {
  welcome_title?: string
  welcome_subtitle?: string
  order_success_title: string
  order_success_subtitle: string
  payment_success_title: string
  payment_success_subtitle: string
  success_message_duration: number
}

function formatModifierLabel(m: ProductModifier): string {
  if (!m.price_adjustment) return m.name;
  const sign = m.price_adjustment > 0 ? "+" : "-";
  return `${m.name} (${sign}${formatCurrency(Math.abs(m.price_adjustment))})`;
}

function cartItemUnitPrice(item: CartItem): number {
  return (
    item.unitPrice ??
    (item.product.has_discount && item.product.discounted_price
      ? item.product.discounted_price
      : item.product.base_price)
  );
}

function cartItemModifierSum(item: CartItem): number {
  return (item.selectedModifiers ?? []).reduce((s, m) => s + m.price_adjustment, 0);
}

export const CustomerDisplayView: React.FC<CustomerDisplayViewProps & { subtotal?: number; discount?: number }> = ({
  branchId,
  terminalCode,
  cart,
  total,
  subtotal,
  discount,
  table,
  metadata,
  successSignal,
  onSuccessSignalComplete,
  keepOrderShell = false,
}) => {
  const t = useTranslations("pos.display");
  const tPay = useTranslations("pos.payment");
  const [settings, setSettings] = React.useState<DisplaySettings | null>(null);

  React.useEffect(() => {
    if (!branchId) return;
    const fetchSettings = async () => {
      try {
        const params: Record<string, string> = { branch_id: branchId };
        if (terminalCode) params.terminal_code = terminalCode;
        const res = await api.get("pos-display/settings/", { params });
        const data = res.data as { results?: DisplaySettings[] } | DisplaySettings[];
        const settingsData = Array.isArray(data) ? data[0] : data.results?.[0];
        if (settingsData) setSettings(settingsData as DisplaySettings);
      } catch (err) {
        console.error("Failed to fetch display settings:", err);
      }
    };
    void fetchSettings();
  }, [branchId, terminalCode]);

  const onSuccessCompleteRef = React.useRef(onSuccessSignalComplete);
  React.useEffect(() => {
    onSuccessCompleteRef.current = onSuccessSignalComplete;
  }, [onSuccessSignalComplete]);

  // Timer: parent'tan gelen callback her render'da yenilenince (WS ile) süre sıfırlanmasın diye ref kullanılır.
  React.useEffect(() => {
    if (!successSignal) return;
    const durationSec = settings?.success_message_duration ?? 5;
    const timer = setTimeout(() => {
      onSuccessCompleteRef.current?.();
    }, Math.max(1, durationSec) * 1000);
    return () => clearTimeout(timer);
  }, [successSignal, settings?.success_message_duration]);
  const isPayment = metadata?.isPaymentMode;
  const method = metadata?.paymentMethod;
  const isProcessing = metadata?.isProcessing;

  const paymentMethodLabel =
    method === "CARD"
      ? tPay("card")
      : method === "OTHER"
        ? tPay("other")
        : method === "CREDIT"
          ? tPay("credit")
          : tPay("cash");
  const PaymentMethodIcon =
    method === "CARD"
      ? CreditCard
      : method === "OTHER"
        ? MoreHorizontal
        : method === "CREDIT"
          ? Wallet
          : Banknote;
  const paymentIconClass =
    method === "CARD"
      ? "text-blue-400"
      : method === "OTHER"
        ? ""
        : method === "CREDIT"
          ? "text-violet-400"
          : "text-amber-400";

  const displaySubtotal = subtotal ?? total;
  const displayDiscount = discount || 0;

  // Bekleme modu yalnız başarı mesajı yokken; seçenek/allerjen modalı açıkken IDLE'a dönme.
  if (
    cart.length === 0 &&
    !isPayment &&
    !table &&
    !successSignal &&
    !keepOrderShell
  ) {
    return <CustomerDisplayIdle branchId={branchId} terminalCode={terminalCode} />;
  }

  return (
    <>
      <style>{`
        @keyframes customer-display-shrink-width {
          from { width: 100%; }
          to { width: 0%; }
        }
        .customer-display-shrink-bar {
          animation: customer-display-shrink-width calc(var(--customer-shrink-s, 5) * 1s) linear forwards;
        }
        @keyframes customer-display-kenburns {
          from { transform: scale(1); }
          to { transform: scale(1.15) translate(1%, 1%); }
        }
        .customer-display-kenburns-bg {
          animation: customer-display-kenburns 20s infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .customer-display-kenburns-bg {
            animation: none;
            transform: none;
            will-change: auto;
          }
        }
      `}</style>
      <div className="flex h-screen w-full bg-card overflow-hidden font-sans relative">
      {/* Left Side: Order List */}
      <div className={`flex-[3] flex flex-col h-full border-r border-border shadow-xl z-10 transition-all duration-700 ${isPayment ? 'grayscale-[0.2]' : ''}`}>
        <header className="sticky top-0 flex items-center justify-between border-b p-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("orderDetails")}</h1>
            {table ? (
               <p className="text-muted-foreground font-medium mt-0.5">
                {table.name} <span className="mx-1">•</span> {t("tableNo", { number: table.number })}
              </p>
            ) : (
              <p className="text-muted-foreground font-medium mt-0.5">{t("checkCart")}</p>
            )}
          </div>
          <div className="bg-blue-50 p-2 rounded-xl">
            <Utensils className="h-6 w-6 text-blue-600" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-dashed border-border">
                <Utensils className="h-10 w-10" />
              </div>
              <p className="text-xl font-medium">{t("emptyCart")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => {
                const lineCancelled =
                  (item.orderLineStatus || "").toUpperCase() === "CANCELLED";
                const baseUnitPrice = cartItemUnitPrice(item);
                const modifierSum = cartItemModifierSum(item);
                const effectiveUnitPrice = baseUnitPrice + modifierSum;
                const lineTotal = effectiveUnitPrice * item.quantity;
                const modifiers = item.selectedModifiers ?? [];
                const hasAllergens = productHasAllergens(item.product);
                const caloriesLabel = formatProductCalories(item.product.calories, t);
                return (
                  <div
                    key={item.cartId}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
 lineCancelled
 ? "border-rose-200/80 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/25"
 : " "
 }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-9 w-9 shrink-0 rounded-md border flex items-center justify-center shadow-sm ${
 lineCancelled
 ? "border-rose-200 bg-white/90 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40"
 : "border-border text-blue-600"
 }`}
                      >
                        <span className="text-base font-bold">{item.quantity}x</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <h3
                            className={`text-base font-bold break-words min-w-0 ${
 lineCancelled
 ? " line-through decoration-rose-400 decoration-2"
 : ""
 }`}
                          >
                            {item.product.name}
                          </h3>
                          {hasAllergens && (
                            <span
                               className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white"
                              aria-label={t("allergenShieldAria")}
                              title={t("allergenShieldAria")}
                            >
                              <ShieldAlert size={14} strokeWidth={2.25} />
                            </span>
                          )}
                        </div>
                        {caloriesLabel && (
                          <p
                            className={`mt-0.5 text-sm font-semibold tabular-nums ${
 lineCancelled
 ? " line-through"
 : "text-amber-700"
 }`}
                          >
                            {caloriesLabel}
                          </p>
                        )}
                        {item.selectedUnit && (
                          <p
                            className={`text-xs font-semibold uppercase tracking-wider mt-0 ${
 lineCancelled
 ? "text-rose-600/80 line-through"
 : "text-muted-foreground"
 }`}
                          >
                            {item.selectedUnit.name}
                          </p>
                        )}
                        {(item.selectedModifiers ?? []).length > 0 && (
                          <p
                            className={`text-xs font-medium mt-0 ${
 lineCancelled
 ? "text-rose-600/80 line-through"
 : "text-emerald-700 dark:text-emerald-400"
 }`}
                          >
                            * {modifiers.map(formatModifierLabel).join(", ")}
                          </p>
                        )}
                        {lineCancelled && (
                          <p className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
                            {t("itemCancelledHint")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <p
                        className={`text-lg font-bold ${
 lineCancelled
 ? " line-through decoration-rose-300"
 : ""
 }`}
                      >
                        {formatCurrency(lineTotal)}
                      </p>
                      <p
                        className={`text-xs font-medium ${
 lineCancelled ? " line-through" : "text-muted-foreground"
 }`}
                      >
                        {t("unitPrice", {
                          price: formatCurrency(effectiveUnitPrice),
                        })}
                      </p>
                      {lineCancelled && (
                        <span className="mt-2 inline-flex rounded-full bg-rose-600 px-2.5 py-0.5 text-sub font-bold uppercase tracking-wide text-white">
                          {t("itemCancelled")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Total & Info */}
      <div className="flex-[2] flex flex-col h-full bg-card text-white p-12 justify-center relative overflow-hidden transition-all duration-700">
        {/* Abstract Background Decoration */}
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-600/25" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-600/20" />

        <div className="relative z-10 mb-auto">
          <div className="bg-blue-600 w-16 h-1 rounded-full mb-8"></div>
          <h2 className="text-5xl font-bold mb-6 leading-tight">
            {isPayment ? (
              <>
                {t("paymentPhase")}
              </>
            ) : (
              <span className="block whitespace-pre-line">
                {settings?.welcome_title?.trim() || t("welcome")}
              </span>
            )}
          </h2>
          <p className="text-muted-foreground text-xl leading-relaxed max-w-sm">
            {isPayment
              ? t("followStaff")
              : settings?.welcome_subtitle?.trim() ||
                t("trackOrder")}
          </p>

          <div className="mt-12 space-y-6">
            <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500 ${isPayment ? 'text-blue-400 bg-blue-400/10 border-blue-400/30' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'}`}>
              {isPayment ? <Sparkles className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              <span className="font-bold text-lg">{isPayment ? t("closingAccount") : t("securePayment")}</span>
            </div>

            {isPayment && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em]">{tPay("method")}</p>
                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="bg-white/10 p-3 rounded-xl">
                    <PaymentMethodIcon className={`h-6 w-6 ${paymentIconClass}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold tracking-tight">{paymentMethodLabel}</p>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">{t("selectedMethod")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 space-y-6 mt-8">
          {displayDiscount > 0 && (
            <div className="space-y-3 bg-white/5 rounded-3xl p-6 border border-white/5">
              <div className="flex justify-between items-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
                <span>{t("subtotal")}</span>
                <span className="">{formatCurrency(displaySubtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-emerald-400 font-bold uppercase tracking-widest text-xs">
                <span>{t("discount")}</span>
                <span>-{formatCurrency(displayDiscount)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-muted-foreground font-bold uppercase tracking-[0.2em] text-sm px-2">
            <span>{isPayment ? t("amountToPay") : t("totalAmount")}</span>
            <ChevronRight className="h-4 w-4" />
          </div>

          <div className="relative flex flex-col items-center justify-center gap-2 rounded-5xl border border-white/10 /90 p-8 shadow-2xl">
            <span className="text-6xl sm:text-7xl font-bold tracking-tighter relative z-10 flex items-start">
              {formatCurrency(total)}
            </span>
            <span className="text-white/40 font-bold text-sm uppercase tracking-[0.3em] relative z-10">{isProcessing ? t("processing") : t("taxIncluded")}</span>
          </div>

          {isProcessing && (
            <div className="flex justify-center animate-bounce">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Subtle Background Layer for Payment Mode */}
      {isPayment && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-blue-950/20" />
        </div>
      )}
      {/* Success Overlay */}
      {successSignal && (
        <div className="absolute inset-0 z-[100] flex animate-in items-center justify-center /95 fade-in duration-500">
          <div className="text-center space-y-8 max-w-2xl px-12 animate-in zoom-in-95 slide-in-from-bottom-10 duration-700">
            <div className="flex justify-center">
              <div className="h-40 w-40 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" />
                <CheckCircle2 className="h-24 w-24 text-emerald-500 animate-in zoom-in duration-1000 delay-300" />
              </div>
            </div>
            <div className="space-y-4">
              <h2 className="text-7xl font-bold text-white tracking-tighter">
                {successSignal === "ORDER"
                  ? (settings?.order_success_title ?? t("orderSuccess"))
                  : (settings?.payment_success_title ?? t("paymentSuccess"))}
              </h2>
              <p className="text-2xl font-medium leading-relaxed">
                {successSignal === "ORDER"
                  ? (settings?.order_success_subtitle ?? t("orderSuccessDesc"))
                  : (settings?.payment_success_subtitle ?? t("paymentSuccessDesc"))}
              </p>
            </div>

            {/* Progress Bar for Duration */}
            <div className="mt-12 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="customer-display-shrink-bar h-full bg-emerald-500"
                style={
                  {
                    width: "100%",
                    ["--customer-shrink-s" as string]: String(settings?.success_message_duration ?? 5),
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
