'use client';

import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { locales, localeLabels, localeFlags, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/i18n/config';
import api from '@/lib/api';
import { skipInterceptorToast } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LanguageSwitcherProps {
  /** Anlık aktif locale (server'dan veya cookie'den okunur) */
  currentLocale: string;
  /** Buton varyantı */
  variant?: 'ghost' | 'outline' | 'default';
  /** POS araç çubuğu: yazı+bayrak yalnızca 1920×1080 ve üzeri; altında sadece bayrak emoji */
  labelsOnlyFromFullHd?: boolean;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};SameSite=Lax`;
}

/** Varyanta göre Tailwind sınıfları */
const variantClasses: Record<NonNullable<LanguageSwitcherProps['variant']>, string> = {
  ghost: 'hover:bg-accent hover:text-accent-foreground bg-transparent border-transparent',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 border-transparent',
};

/**
 * Dil değiştirici bileşen.
 * - Cookie'ye NEXT_LOCALE yazar (1 yıl)
 * - Backend'e preferred_language günceller (sessiz)
 * - Sayfayı yeniler → next-intl yeni locale'i alır
 *
 * NOT: Button bileşeni kullanılmaz — DropdownMenuTrigger zaten <button> render eder,
 * iç içe <button> hydration hatasını önlemek için stiller doğrudan uygulanır.
 */
export function LanguageSwitcher({
  currentLocale,
  variant = 'ghost',
  labelsOnlyFromFullHd = false,
}: LanguageSwitcherProps) {
  const t = useTranslations('common.languageSwitcher');

  const handleSwitch = async (locale: Locale) => {
    if (locale === currentLocale) return;

    // Cookie'ye yaz (useRef/useEffect dışında doğrudan atama Compiler tarafından engellenir)
    setCookie(LOCALE_COOKIE, locale);

    // Backend'e kullanıcı tercihini bildir (sessiz hata yönetimi)
    try {
      await api.patch('/api/v1/users/me/', { preferred_language: locale }, skipInterceptorToast);
    } catch {
      // Tercih güncellenemezse bile dil değişimi gerçekleşir
    }

    // Sayfayı yenile → next-intl yeni locale'i yükler
    window.location.reload();
  };

  return (
    <DropdownMenu>
      {/*
        DropdownMenuTrigger kendi <button> elementini render eder.
        İç içe <button> hydration hatasını önlemek için Button bileşeni kullanılmaz;
        stiller doğrudan trigger'a uygulanır.
      */}
      <DropdownMenuTrigger
        id="language-switcher-trigger"
        aria-label={t('ariaLabel')}
        className={cn(
          'inline-flex h-8 items-center justify-center gap-2 rounded-md px-2.5',
          'text-sm font-medium text-muted-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant]
        )}
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={labelsOnlyFromFullHd ? 'hidden fullhd:inline' : 'hidden sm:inline'}>
          {localeFlags[currentLocale as Locale] ?? '🌍'}{' '}
          {localeLabels[currentLocale as Locale] ?? currentLocale.toUpperCase()}
        </span>
        <span className={labelsOnlyFromFullHd ? 'fullhd:hidden' : 'sm:hidden'}>
          {localeFlags[currentLocale as Locale] ?? '🌍'}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[160px]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleSwitch(loc)}
            className={cn(
              'gap-2 cursor-pointer',
              loc === currentLocale && 'bg-accent font-semibold'
            )}
            id={`language-option-${loc}`}
          >
            <span aria-hidden="true">{localeFlags[loc]}</span>
            <span>{localeLabels[loc]}</span>
            {loc === currentLocale && (
              <span className="ms-auto text-primary text-xs">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
