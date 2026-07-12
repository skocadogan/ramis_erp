# Stock Man

> **Depo & Satın Alma Siparişi Yönetim Uygulaması** — Android tablet ve iPad için optimize edilmiş React Native (Expo) uygulaması.

Stock Man, Ramis ERP sisteminin depo ve satın alma süreçlerini mobil/tablet ortamına taşıyan, barkod okuma, stok sayımı, mal kabul ve satın alma siparişi oluşturma işlemlerini destekleyen bir Expo React Native uygulamasıdır.

`mobile_app/` ailesinin **üçüncü** uygulamasıdır:

| Uygulama | Yol | Hedef |
| --- | --- | --- |
| **Waiter** (referans mimari) | `mobile_app/waiter/` | Garson POS — el terminali / tablet |
| **Smart Table** (UI kit referansı) | `mobile_app/smart_table/` | Müşteri menü ekranı — tablet |
| **Stock Man** (bu uygulama) | `mobile_app/stock_man/` | Depo personeli — tablet (Android + iPad) |

---

## 1. Amaç ve Kapsam

- **Hedef cihazlar:** Android tablet ve iPad (öncelik), yatay (landscape) kullanım.
- **Hedef kullanıcılar:** Depo sorumluları, satın alma personeli, mal kabul görevlileri.
- **Temel akışlar:**
  - Barkod okutarak ürün arama ve stok sayımı
  - Mal kabul (giriş fişi) oluşturma
  - Satın alma siparişi taslağı ve onay
  - Mevcut stok ve kritik seviye görüntüleme
  - Şubeler arası transfer
- **Çok dilli:** Türkçe (varsayılan), İngilizce, Bulgarca, Arnavutça.

## 2. Teknoloji Yığını

| Katman | Tercih | Versiyon |
| --- | --- | --- |
| Framework | Expo (managed) + Expo Router | `~56.0.11` / `~56.2.10` |
| Runtime | React Native + React 19 | `0.85.3` / `19.2.3` |
| Stil | NativeWind v4 + Tailwind CSS | `^4.2.4` / `3.4.17` |
| State | Zustand | `^5.0.13` |
| Veri | TanStack Query + Axios | `^5.100.10` / `^1.16.1` |
| Listeleme | Shopify FlashList | `2.3.1` |
| Native | Reanimated 4, Gesture Handler, Screens, SVG, Worklets | en güncel |
| Kamera | `expo-camera` (barkod) | `~56.0.8` |
| Güvenli depolama | `expo-secure-store` (token, ayarlar) | `~56.0.4` |
| Offline | `expo-sqlite` (opsiyonel) | `~56.0.5` |
| Test | Jest + jest-expo + @testing-library/react-native | `^29.7.0` |

> Sürümler, `mobile_app/waiter/package.json` ile aynı sabitlemeyi paylaşır; SDK 56 / React Native 0.85 / React 19.

## 3. Hızlı Başlangıç

```bash
# 1. Bağımlılıklar
cd mobile_app/stock_man
npm install

# 2. Ortam değişkenlerini ayarla
cp .env.example .env
# .env içindeki EXPO_PUBLIC_API_URL adresini kendi backend'inize göre düzenleyin

# 3. Geliştirme sunucusu
npm run start          # Metro + Expo Dev Tools
npm run android        # Android tablet/emulator
npm run ios            # iPad/simulator

# 4. Tip kontrolü + test
npm run typecheck
npm run test           # tek seferlik
npm run test:watch     # izleme modu
npm run test:ci        # CI (coverage)
```

> İlk çalıştırmada `npx expo prebuild` gerekebilir (native klasörler üretilir). `npm run android` / `npm run ios` komutları bunu otomatik tetikler.

## 4. Proje Yapısı

```
stock_man/
├── app/                     # Expo Router dosya tabanlı rotalar
│   ├── _layout.tsx          # Kök layout (QueryClient, auth init) — frontend-ops
│   ├── index.tsx            # Auth-aware redirect — frontend-ops
│   ├── (auth)/              # Login, parola sıfırlama
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (main)/              # Kimlik doğrulama sonrası sekmeler
│       ├── _layout.tsx
│       └── (tabs)/
│           ├── _layout.tsx
│           ├── index.tsx            # Ana sayfa / dashboard
│           ├── stock.tsx            # Stok listesi + barkod okuma
│           ├── receiving.tsx        # Mal kabul
│           ├── purchase-orders.tsx  # Satın alma siparişleri
│           └── settings.tsx         # Dil, sunucu, çıkış
│
├── src/                     # Uygulama mantığı
│   ├── api/                 # axios client, queryClient, servisler
│   │   ├── client.ts
│   │   ├── queryClient.ts
│   │   ├── stockApi.ts
│   │   ├── purchaseOrderApi.ts
│   │   └── receivingApi.ts
│   ├── components/
│   │   ├── ui/              # Button, Input, Card, Dialog, Toast, Badge, …
│   │   ├── BarcodeScanner.tsx
│   │   ├── StockCounter.tsx
│   │   └── ReceivingForm.tsx
│   ├── hooks/               # useAuth, useStock, useResponsive, useDebounce
│   ├── i18n/                # tr/en/bg/sq + useI18n hook
│   ├── store/               # useAuthStore, useUIStore, useStockStore
│   ├── types/               # Domain tipleri (Item, Stock, PO, …)
│   └── utils/               # yardımcılar (cn, formatters, validators)
│
├── assets/                  # icon, splash, ses (TODO: marka ekibi ekleyecek)
├── __tests__/               # bileşen/store testleri
│
├── app.json                 # Expo manifest
├── eas.json                 # EAS Build profilleri
├── babel.config.js          # babel-preset-expo + nativewind + worklets
├── metro.config.js          # withNativeWind(global.css)
├── jest.config.js           # jest-expo + nativewind/zustand transform
├── jest.setup.ts            # Native modül mock'ları
├── tsconfig.json            # strict + @/* path alias
├── global.css               # Tailwind base + tema değişkenleri (style-architect)
├── tailwind.config.js       # Tasarım sistemi renkleri (style-architect)
├── nativewind-env.d.ts      # NativeWind tip köprüsü
├── expo-env.d.ts            # Expo tip referansı
├── .env.example             # EXPO_PUBLIC_API_URL şablonu
├── .gitignore
├── README.md                # ← bu dosya
└── AGENTS.md                # AI ajanları için operasyon notları
```

## 5. Backend Bağlantısı

API tabanı **iki** yerden okunur, öncelik sırasıyla:

1. **Çalışma zamanı** — `app.json` → `expo.extra.apiUrl` (varsayılan: `http://RAMISSERVER_IP/api/v1`).
2. **Geliştirme sırasında override** — `.env` içindeki `EXPO_PUBLIC_API_URL` (Expo'nun `process.env` köprüsü ile istemci tarafında okunur).

> Statik IP'yi **kaynak kontrolüne** almayın. Konfig dosyasındaki `RAMISSERVER_IP` yer tutucusunu kendi geliştirme sunucunuzla değiştirin veya giriş ekranından "Sunucu" ayarı ile ezilmesini sağlayın.

Auth: `POST /api/v1/auth/token/` üzerinden JWT alınır, `expo-secure-store` içinde saklanır, sonraki isteklerde `Authorization: Bearer <token>` header'ı eklenir.

Detaylı API sözleşmesi: [`docs/wiki/API_Client.md`](../../docs/wiki/API_Client.md), [`docs/wiki/Mobile_Waiter_App.md`](../../docs/wiki/Mobile_Waiter_App.md) (aynı pattern).

## 6. Çoklu Dil (i18n)

| Kod | Dil | BCP-47 |
| --- | --- | --- |
| `tr` | Türkçe | `tr-TR` (varsayılan) |
| `en` | English | `en-US` |
| `bg` | Български | `bg-BG` |
| `sq` | Shqip | `sq-AL` |

Aktif dil `useUIStore.language` içinde tutulur ve `useI18n().t("anahtar.alt")` ile erişilir. Kaynak: `src/i18n/tr.json` (diğer diller aynı ağacı yansıtmalı).

## 7. Build & Deploy (EAS)

```bash
# İlk kurulum (EAS projesini bağla)
npx eas init
# → app.json içindeki "extra.eas.projectId" otomatik dolar

# Geliştirme build'i (dev client)
eas build --profile development --platform android

# Preview / internal
eas build --profile preview --platform android

# Production
eas build --profile production --platform android
eas build --profile production --platform ios
eas submit --platform android   # Play Store
eas submit --platform ios       # App Store / TestFlight
```

`eas.json` profilleri `mobile_app/waiter/eas.json` ile aynı yapıyı paylaşır (development/preview/production, `appVersionSource: remote`).

## 8. Geliştirme İpuçları

- **Liste performansı:** `FlashList` kullanın; `estimatedItemSize` belirtin. Stok/Purchase Order listeleri için kritik.
- **Barkod okuma:** `expo-camera` + `useCameraPermissions()`; iPad için `supportsTablet: true` zaten açık.
- **Güvenli depolama:** Hassas veri için **her zaman** `expo-secure-store`. API anahtarı veya token asla AsyncStorage'a düşmesin.
- **Token cache:** `src/api/client.ts` içinde bellek içi token cache tutun, böylece her istekte SecureStore I/O yapılmaz (waiter pattern'i).
- **Tasarım sistemi:** `global.css` ve `tailwind.config.js` üzerinden tema değişkenleri — style-architect ajanının kararlarına uyun.
- **Karanlık mod:** `useColorScheme()` (NativeWind) + `Appearance.setColorScheme` senkronizasyonu.

## 9. İlgili Dokümanlar

- Wiki: [`docs/wiki/Index.md`](../../docs/wiki/Index.md)
- Frontend mimari: [`docs/wiki/Frontend_Architecture.md`](../../docs/wiki/Frontend_Architecture.md)
- API istemcisi: [`docs/wiki/API_Client.md`](../../docs/wiki/API_Client.md)
- Tasarım sistemi: [`docs/wiki/Design_System_v2.md`](../../docs/wiki/Design_System_v2.md)
- Auth akışı: [`docs/wiki/Auth_Flow.md`](../../docs/wiki/Auth_Flow.md)
- Waiter referans: [`docs/wiki/Mobile_Waiter_App.md`](../../docs/wiki/Mobile_Waiter_App.md)
- Ajan/operasyon notları: [`AGENTS.md`](./AGENTS.md)

## 10. Lisans

© Ramis ERP. Tüm hakları saklıdır. Dahili kullanım.
