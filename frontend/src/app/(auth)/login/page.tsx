"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import axios from "axios";
import api, { refreshTokenCache } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { ChefHat, Loader2, User, Lock, ArrowRight, Check, ArrowLeft, Delete, KeyRound } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ThemeMenu } from "@/components/shell/ThemeMenu";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [step, setStep] = useState<"username" | "password" | "pin">("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setStoreRememberMe = useAuthStore((state) => state.setRememberMe);
  const t = useTranslations("auth.login");
  const locale = useLocale();

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setError("");
    setIsLoading(true);

    try {
      const res = await api.post("/auth/check-pin/", { username: username.trim() });
      if (res.data.has_pin && res.data.has_cashier_role) {
        setStep("pin");
        setPin("");
      } else {
        setStep("password");
        setPassword("");
      }
    } catch {
      // Safe fallback to password login
      setStep("password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await api.post("/auth/token/", {
        username: username.trim(),
        password,
        remember_me: rememberMe,
      });
      const token = response.data.access;
      setStoreRememberMe(rememberMe);
      setAuth({ id: "temp", username }, token);

      const meRes = await api.get("/auth/me/");
      const user = meRes.data;
      setAuth(
        {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          branch_id: user.branch,
          branch_name: user.branch_name,
          available_branches: user.available_branches,
          is_superuser: user.is_superuser,
          permissions: user.all_permissions || [],
        },
        token
      );

      // API interceptor'daki token cache'ini güncelle (hard redirect'ten önce)
      refreshTokenCache();

      if (user.preferred_language && user.preferred_language !== locale) {
        document.cookie = `${LOCALE_COOKIE}=${user.preferred_language};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};SameSite=Lax`;
      }

      // ── Yönlendirme hedefini belirle ──────────────────────────────────────────
      // 1) Role_names'e göre Kasiyer kontrolü (birincil)
      const isCashier = user.role_names?.some(
        (r: string) => r.toLowerCase() === "kasiyer" || r.toLowerCase() === "cashier"
      );

      // 2) Permissions'a dayalı fallback: Kasiyer rolü olmasa bile
      //    yalnızca POS yetkisi olan kullanıcıları POS'a yönlendir.
      const permissions: string[] = user.all_permissions ?? [];
      const isSuperuser = user.is_superuser ?? false;
      const isPosOnlyUser =
        !isSuperuser &&
        permissions.includes("pos.view_pos") &&
        // Admin/panel yetkisi olmadığını doğrula
        !permissions.some((p: string) =>
          /^(users\.|rbac\.|branches\.manage|reporting\.)/.test(p)
        );

      const targetUrl = isCashier || isPosOnlyUser ? "/pos" : "/panel";

      // Hard redirect: router.push() client-side navigasyon yapar ve
      // Zustand persist race condition'larına yol açar. window.location.href
      // ile tam sayfa yenilemesi yaparak eski kullanıcı verisinin
      // görünmesini engelliyoruz.
      window.location.href = targetUrl;
    } catch (err) {
      console.error(err);
      setError(t("invalidCredentials"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinLogin = useCallback(async (e?: React.FormEvent, pinValue?: string) => {
    if (e) e.preventDefault();
    const activePin = pinValue || pin;
    if (activePin.length !== 4) return;

    setError("");
    setIsLoading(true);

    try {
      const response = await api.post("/auth/token/pin/", {
        username: username.trim(),
        pin: activePin,
        remember_me: rememberMe,
      });
      const token = response.data.access;
      setStoreRememberMe(rememberMe);
      setAuth({ id: "temp", username }, token);

      const meRes = await api.get("/auth/me/");
      const user = meRes.data;
      setAuth(
        {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          branch_id: user.branch,
          branch_name: user.branch_name,
          available_branches: user.available_branches,
          is_superuser: user.is_superuser,
          permissions: user.all_permissions || [],
        },
        token
      );

      // API interceptor'daki token cache'ini güncelle (hard redirect'ten önce)
      refreshTokenCache();

      if (user.preferred_language && user.preferred_language !== locale) {
        document.cookie = `${LOCALE_COOKIE}=${user.preferred_language};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};SameSite=Lax`;
      }

      // Hard redirect: PIN ile giriş yapan kasiyer POS'a yönlendirilir
      window.location.href = "/pos";
    } catch (err) {
      console.error(err);
      let errorMsg = t("invalidCredentials");
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        errorMsg = err.response.data.error;
      }
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [pin, username, rememberMe, locale, setStoreRememberMe, setAuth, t]);

  const handleNumpadPress = useCallback((val: string) => {
    if (val === "C") {
      setPin("");
    } else if (val === "back") {
      setPin((prev) => prev.slice(0, -1));
    } else {
      if (pin.length < 4 && /^\d$/.test(val)) {
        const newPin = pin + val;
        setPin(newPin);
        if (newPin.length === 4) {
          // Auto submit PIN once it reaches 4 digits by passing the value directly (fixes stale closure)
          setTimeout(() => {
            void handlePinLogin(undefined, newPin);
          }, 100);
        }
      }
    }
  }, [pin, handlePinLogin]);

  const handleBackToUsername = () => {
    setStep("username");
    setError("");
  };

  useEffect(() => {
    if (step !== "pin" || isLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Eğer kullanıcı odaklanmış bir input alanında yazıyorsa klavye kısayollarını çalıştırma
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      const key = e.key;
      if (/^\d$/.test(key)) {
        e.preventDefault();
        handleNumpadPress(key);
      } else if (key === "Backspace") {
        e.preventDefault();
        handleNumpadPress("back");
      } else if (key === "Escape" || key.toLowerCase() === "c") {
        e.preventDefault();
        handleNumpadPress("C");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [step, isLoading, handleNumpadPress]);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12 selection:bg-primary/10 sm:px-6 lg:px-8">
      {/* Subtle background gradient — no blur/GPU effects */}

      <div className="w-full max-w-[440px]">
        {/* Top Actions: Lang & Theme */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ChefHat size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight">Ramis ERP</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher currentLocale={locale} variant="ghost" />
            <ThemeMenu />
          </div>
        </div>

        {/* Login Card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/5 animate-in fade-in zoom-in-95 duration-200">
          <div className="px-8 pt-10 pb-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {step === "pin" ? t("pinTitle") : t("title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {step === "pin"
                  ? t("pinSubtitle")
                  : t("subtitle")}
              </p>
            </div>

            {error ? (
              <div
                className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive animate-in fade-in slide-in-from-top-2"
                role="alert"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  !
                </div>
                {error}
              </div>
            ) : null}

            {step === "username" && (
              <form className="space-y-5" onSubmit={handleNext} noValidate>
                <div className="space-y-2">
                  <label
                    htmlFor="login-username"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("username")}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary">
                      <User size={18} />
                    </div>
                    <input
                      id="login-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      placeholder={t("username")}
                      required
                      autoFocus
                      className="block w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !username.trim()}
                  className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <>
                      {t("continue")}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {step === "password" && (
              <form className="space-y-5" onSubmit={handleLogin} noValidate>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBackToUsername}
                    className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                  >
                    <ArrowLeft size={14} /> {t("back")}
                  </button>
                  <span className="text-xs text-muted-foreground">| {t("userLabel", { username })}</span>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="login-password"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t("password")}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-foreground transition-colors group-focus-within:text-primary">
                      <Lock size={18} />
                    </div>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      placeholder={t("password")}
                      required
                      autoFocus
                      className="block w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer select-none items-center gap-2.5 group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isLoading}
                        className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-border bg-background transition-all checked:border-primary checked:bg-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <Check className="absolute left-0.5 top-0.5 h-3 w-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={4} />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {t("rememberMe")}
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      {t("loggingIn")}
                    </>
                  ) : (
                    <>
                      {t("submit")}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {step === "pin" && (
              <form className="space-y-5" onSubmit={handlePinLogin} noValidate>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleBackToUsername}
                      className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                    >
                      <ArrowLeft size={14} /> {t("back")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("password")}
                      className="text-xs font-semibold text-muted-foreground flex items-center gap-1 hover:underline"
                    >
                      <KeyRound size={12} /> {t("passwordLogin")}
                  </button>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="login-pin"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block text-center"
                  >
                    {t("pinLabel")}
                  </label>
                  <div className="flex justify-center gap-3 py-2">
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className={cn(
                          "w-4 h-4 rounded-full border-2 transition-all duration-150",
                          pin.length > index
                            ? "bg-primary border-primary scale-110 shadow-glow"
                            : "border-muted-foreground/30 bg-transparent"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Premium Lock-screen Keypad */}
                <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto pt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleNumpadPress(num.toString())}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-border hover:bg-secondary dark:hover: font-semibold text-xl transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleNumpadPress("C")}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-semibold text-base transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                  >
                    C
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleNumpadPress("0")}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-border hover:bg-secondary dark:hover: font-semibold text-xl transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    disabled={isLoading || !pin}
                    onClick={() => handleNumpadPress("back")}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-border hover:bg-secondary dark:hover: font-semibold text-lg transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
                  >
                    <Delete size={18} className="text-muted-foreground" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link
            href="/"
            className="font-semibold text-foreground underline-offset-4 transition-all hover:text-primary hover:underline"
          >
            ← {t("backToHome")}
          </Link>
          <span className="mx-2 text-border">|</span>
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
