import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, LOCALE_COOKIE, type Locale } from './config';
import { ALL_MODULES } from './route-modules';

/**
 * next-intl server konfigürasyonu.
 * - Locale: NEXT_LOCALE cookie → yoksa defaultLocale (tr)
 * - Mesajlar: TÜM modüller yüklenir (yönlendirilen tüm sayfaların çevirileri
 *   ilk render'da hazır olur, F5 gerekmez)
 * - Fallback: eksik locale dosyası varsa Türkçe kullanılır
 *
 * NOT: Başlangıçta yalnızca aktif rotanın modülleri yükleniyordu (~3-6 modül,
 * ~200-250KB tasarruf). Ancak bu, client-side navigation'da yeni sayfanın
 * modülleri <NextIntlClientProvider messages>'a eklenmediği için F5
 * zorunluluğu yaratıyordu (root layout tekrar render edilmiyor). Şimdi tüm
 * modüller (~26 modül, ~220KB toplam) ilk yüklemede paralel yüklenir;
 * navigation her zaman sorunsuz çeviri yapar.
 *
 * Modüller birbirinden bağımsız → Promise.all ile paralel yükle.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = locales.includes(raw as Locale)
    ? (raw as Locale)
    : defaultLocale;

  const loaded = await Promise.all(
    ALL_MODULES.map(async (mod): Promise<[string, unknown]> => {
      try {
        const m = (await import(`./messages/${locale}/${mod}.json`)).default;
        return [mod, m];
      } catch {
        // Fallback: Türkçe
        try {
          const m = (await import(`./messages/tr/${mod}.json`)).default;
          return [mod, m];
        } catch {
          return [mod, {}];
        }
      }
    })
  );

  const messages: Record<string, unknown> = Object.fromEntries(loaded);

  return { locale, messages };
});
