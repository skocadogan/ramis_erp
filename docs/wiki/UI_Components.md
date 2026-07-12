# UI Components (Bileşen Kütüphanesi)

> **Özet:** Shadcn/ui + Radix UI tabanlı özelleştirilmiş bileşen kütüphanesi. class-variance-authority (CVA) ile varyant yönetimi, TailwindCSS ile stil.
> **Kütüphaneler:** Shadcn/ui, Radix UI, CVA, Lucide React
> **Bağlantılar:** [[Frontend_Architecture]], [[Frontend_POS]], [[API_Client]], [[Frontend_Formatters]], [[Frontend_Error_Handling]]

---

## Global bildirimler (Sonner)

`app/providers.tsx` içinde `<Toaster position="top-right" richColors />` monte edilir. Genel amaçlı kısa mesajlar için `import { toast } from "sonner"` kullanılabilir; **API yanıtına bağlı** kullanıcı geri bildirimi (hata / işlem başarısı) için tercihen [[API_Client]] içindeki `operationalToast` (`toastApiError`, `toastApiSuccess`) kullanılır — prod’da interceptor sessizken tek tutarlı kanal budur.

Merkezi **Axios** isteğinden gelen otomatik toast'lar (`api.ts` interceptor) ortam politikasına tabidir; development’ta çift bildirim için ilgili isteklerde `skipInterceptorToast` kullanılır.

---

## Konum
`frontend/src/components/ui/`

## Bileşenler

| Bileşen | Açıklama |
|---------|----------|
| `button.tsx` | Çoklu varyant düğme |
| `input.tsx` | Form girdisi |
| `select.tsx` | Açılır seçim |
| `dialog.tsx` | Modal dialog |
| `alert-dialog.tsx` | Onay dialog |
| `dropdown-menu.tsx` | Açılır menü |
| `tabs.tsx` | Sekme navigasyonu |
| `table.tsx` | Tablo bileşeni |
| `card.tsx` | Kart konteynır |
| `badge.tsx` | Etiket/rozet |
| `checkbox.tsx` | Onay kutusu |
| `switch.tsx` | Toggle anahtarı |
| `label.tsx` | Form etiketi |
| `popover.tsx` | Açılır içerik |
| `tooltip.tsx` | İpucu |
| `hover-card.tsx` | Üzerine gelme kartı |
| `number-input.tsx` | Sayısal giriş |
| `async-state.tsx` | Yükleme / boş / hata durumları (`AsyncStatePanel`, `TableAsyncStateRow`, `PageLoadingState`); i18n: `common.asyncState` |

## Async durum kalıbı

Kritik ekranlarda (dashboard, admin audit, tablo listeleri) tutarlı UX için:

- **`PageLoadingState`** — tam sayfa veya bölüm yükleyici (`text-primary` spinner)
- **`AsyncStatePanel`** — boş / hata kartı; hata durumunda `onRetry` ile yeniden dene
- **`TableAsyncStateRow`** — sanal tablolarda tbody içi loading/empty/error satırı (inventory referans kalıbı)

Metinler `frontend/src/i18n/messages/{tr,en}/common.json` → `asyncState.*` anahtarlarından gelir.
| `modal-overlay.tsx` | Modal arka plan |
| `order-status-badge.tsx` | Sipariş durum etiketi |
| `vertical-status-timeline.tsx` | Dikey durum zaman çizelgesi |
| `custom-toast.tsx` | Özelleştirilmiş toast |
| `VirtualKeyboard.tsx` | Sanal klavye (dokunmatik POS için) |

## Diğer Bileşenler
- `tree-view.tsx` — Hiyerarşik ağaç görünümü
- `AppImage.tsx` — Next.js Image wrapper
- `components/auth/` — Kimlik doğrulama bileşenleri
- `components/pwa/` — PWA/Service Worker bileşenleri
