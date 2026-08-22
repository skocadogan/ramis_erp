# API Client (Axios HTTP İstemci)

> **Özet:** Axios tabanlı merkezi HTTP istemci. Otomatik `baseURL`, JWT token yenileme, isteğe bağlı **ortam bazlı** success/error toast'ları; bilinçli kullanıcı mesajları için `operationalToast` katmanı.
> **Kütüphaneler:** Axios, Sonner (toast), Zustand
> **Bağlantılar:** [[Auth_Flow]], [[State_Management]], [[Frontend_Architecture]], [[UI_Components]], [[API_Responses]]

---

## Konum
| Dosya | Rol |
|-------|-----|
| `frontend/src/lib/api.ts` | Axios instance, response interceptor (toast + 401 refresh) |
| `frontend/src/lib/tokenCache.ts` | Access JWT bellek önbelleği; logout `clearTokenCache`, login `refreshTokenCache` |
| `frontend/src/lib/apiToastPolicy.ts` | Interceptor toast'larının hangi ortamda çalışacağı |
| `frontend/src/lib/operationalToast.ts` | `toastApiError` / `toastApiSuccess`, `skipInterceptorToast` + `extractApiError` re-export |
| `frontend/src/types/axios-augment.d.ts` | `AxiosRequestConfig.skipApiToast` tip genişletmesi |
| `frontend/src/app/providers.tsx` | `<Toaster />` (Sonner) |

## Özellikler

### Request Interceptor
- `baseURL` her istekte `getRuntimeConfig().apiBaseUrl` ile dinamik atanır
- `withCredentials: true` — Cookie tabanlı JWT
- `Authorization: Bearer` `readAccessToken()` ile (`tokenCache.ts`); logout sonrası skip bayrağı localStorage'dan token okumaz

### Toast politikası (merkezi)

**Interceptor** (`api.ts` success + error kolları) yalnızca `shouldToastFromApiInterceptor()` true iken Sonner ile toast basar:

| Ortam / ayar | Davranış |
|--------------|----------|
| `NODE_ENV === "production"` | Varsayılan: **toast yok** (sessiz; hata yine `Promise.reject` ile yükselir) |
| Development | Backend `message` / `detail` (başarı) ve `detail` / `message` / validation (hata) toast |
| `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS` | `true` / `false` ile prod veya dev üzerinde zorla aç/kapat |

**Operational toast** — `operationalToast.ts`:
- `toastApiError(err, fallback)` ve `toastApiSuccess(message)` **her ortamda** çalışır; production'da kullanıcıya gösterilmesi gereken API hataları / başarıları için kullanılır.
- `extractApiError` mesaj çıkarımı `api-utils.ts` içinde tanımlıdır ve **`operationalToast` üzerinden re-export** edilir; böylece toast + satır içi hata metni için tek import yolu: `@/lib/operationalToast`.

**Çift toast önleme (development):** Catch içinde `toastApiError` kullanılıyorsa aynı isteğe `{ ...skipInterceptorToast }` eklenir (`api.ts` export veya `operationalToast` re-export). `skipApiToast: true` olan isteklerde interceptor toast basmaz; tek bildirim catch'ten gelir.

### Frontend uygulama özeti (mutasyon + geri bildirim)

| Kalıp | Ne zaman |
|-------|----------|
| `toastApiError(err, "…")` | Try/catch veya mutation `onError` ile kullanıcıya API hatası gösterme |
| `toastApiSuccess("…")` | İşlem başarısını bilinçli gösterme (interceptor’a güvenmeden) |
| `{ ...skipInterceptorToast }` | Yukarıdaki toast’larla **aynı** `api` isteğinin config’inde (genelde feature `*Api.ts` veya doğrudan `api.post` son argümanı) |
| `extractApiError(err, "…")` | Toast **yok**; sadece string (`setPayError`, form alanı, query hata metni vb.) — `toastApiError` ile aynı metin çıkarımı |

**Servis katmanı:** Mutasyon yapan `api.post` / `patch` / `delete` çağrıları, üst bileşende `toastApiError` kullanılıyorsa `skipInterceptorToast` ile işaretlenir (ör. `features/*/services/*Api.ts`, panelde doğrudan `api` kullanımı).

**Örnek kapsam (ilerletilmiş modüller):** vardiya (`shiftsApi`), yönetim atamaları ve şube sil/geri yükle (`adminApi`), hazırlık (`prepApi`), üretim planlama (`production-planning/services/api`), masalar / bölgeler (`tablesApi`), rezervasyon REST (`reservationsApi`), geri dönüşüm (`recycleBinApi`), faturalar (`invoicesApi`), sipariş zorla kapanış ve POS mutasyonlarında ilgili bileşenler.

Tip: `skipApiToast` yalnızca Axios config'indedir; HTTP header olarak **gönderilmez**.

### Response Interceptor — Başarı
- `message` / `detail` string ise ve politika + `skipApiToast` uygunsa → `toast.success`

### Response Interceptor — Hata
- Aynı koşullarla `detail` / `message` / `error` veya ilk validation alanı → `toast.error`
- **401 Handling:** Otomatik token yenileme akışı (toast politikasından bağımsız reject)

### Token Refresh Akışı
1. İlk 401 → `isRefreshing = true`, refresh isteği gönder
2. Sonraki 401'ler → `failedQueue`'ya ekle (bekle)
3. Refresh başarılı → kuyruktan retry
4. Refresh başarısız → tüm kuyruk reject + logout + `/` yönlendirmesi
5. **Sonsuz döngü koruması:** Refresh endpoint'i 401 → direkt logout

## Yardımcı Dosyalar

| Dosya | İçerik |
|-------|--------|
| `api-utils.ts` | `unwrapList`, `extractApiError` (kaynak tanım; mesaj çıkarımı) |
| `apiToastPolicy.ts` | `shouldToastFromApiInterceptor` |
| `operationalToast.ts` | `toastApiError`, `toastApiSuccess`, `skipInterceptorToast` re-export, `extractApiError` re-export |
| `queryKeys.ts` | TanStack Query anahtar sabitleri |
| `parseApiError.ts` | Hata parse (bazı modüllerde) |
| `runtimeConfig.ts` | Çalışma zamanı konfigürasyonu |
| `healthCheck.ts` | Backend sağlık kontrolü |
| `formatters.ts` | Veri formatlama |
| `constants.ts` | Uygulama sabitleri |

Doğrudan `import { toast } from "sonner"` çağrıları interceptor politikasını **bypass** eder (ör. anlık bilgi, non-API mesajlar). **API sonucu** kullanıcıya yansıtırken tercihen `toastApiError` / `toastApiSuccess` kullanılmalıdır; böylece mesaj çıkarımı `extractApiError` ile tutarlı kalır ve prod’da bilinçli toast tek başına yeterlidir.
