# Frontend Ortam Değişkenleri (`frontend.env`)

> **Özet:** Next.js istemcisinin API adresi ve özellik bayrakları `NEXT_PUBLIC_*` ortam değişkenleriyle tanımlanır. Üretimde `/etc/ramis/frontend.env` systemd tarafından okunur; API URL için rebuild gerektirmeyen [[Runtime_Config]] katmanı vardır.
> **Kütüphaneler:** Next.js 16 App Router, Serwist (PWA), next-intl, Zod (`clientPublicSchema.ts`)
> **Bağlantılar:** [[Runtime_Config]], [[Deployment]], [[Frontend_Architecture]], [[API_Client]], [[POS_Offline_Queue]], [[PWA]], [[Backend_Environment]]

---

## Dosya konumları

| Ortam | Şablon | Aktif dosya |
|-------|--------|-------------|
| Geliştirme | `frontend/.env.example` → `.env.local` | `frontend/.env.local` (gitignore) |
| Staging pilot | `frontend/.env.staging.example` | `.env.local` veya CI secret |
| Üretim | — | `/etc/ramis/frontend.env` |
| Runtime (IP / bayrak) | — | `/etc/ramis/runtime-config.json` |

Doğrulama: `frontend/src/environments/clientPublicSchema.ts` — build/dev başlangıcında `NEXT_PUBLIC_*` şeması kontrol edilir.

---

## Öncelik sırası (API ve bayraklar)

```
/etc/ramis/runtime-config.json     ← en yüksek (canlı API URL + bayraklar)
    ↓
Aynı origin /api/v1 (Nginx proxy)  ← IP tek sunucuda sabitken
    ↓
NEXT_PUBLIC_* (build / .env.local) ← geliştirme ve fallback
```

Bkz: [[Runtime_Config]], `frontend/src/lib/runtimeConfig.ts`.

---

## Değişiklik sonrası ne yapılır?

| Değişen | Gerekli adım |
|---------|--------------|
| `NEXT_PUBLIC_API_URL` (IP/domain) | `sudo bash update.sh --change-ip <IP>` **veya** `--sync-runtime-config` — **frontend rebuild gerekmez** (runtime JSON güncellenir) |
| `NEXT_PUBLIC_POS_OFFLINE_QUEUE` | Üretimde `install.sh` / `update.sh` otomatik `true` yazar; manuel değişiklik sonrası `sudo bash update.sh --sync-runtime-config` → istemci sayfayı yeniler |
| `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS` | Aynı |
| Yeni `NEXT_PUBLIC_*` anahtarı eklendi | `clientPublicSchema.ts` + **npm run build** (bundle'a gömülür) |
| `ALLOWED_DEV_ORIGINS` (geliştirme) | `next.config.ts` — dev sunucusu yeniden başlat |

Üretim frontend servisi: `EnvironmentFile=-/etc/ramis/frontend.env` ([[Standalone_Deploy]]). `PORT` bu dosyadan okunabilir (varsayılan 3000).

---

## `NEXT_PUBLIC_*` değişkenleri (referans)

### `NEXT_PUBLIC_API_URL`

| | |
|--|--|
| **Zorunlu** | Production/staging **build** için evet; runtime'da JSON override edilebilir |
| **Format** | `http(s)://host:port/api/v1` — yol **mutlaka** `/api/v1` ile biter |
| **Örnek (dev)** | `http://localhost:8000/api/v1` |
| **Örnek (LAN)** | `http://192.168.0.10/api/v1` |

Cookie tabanlı JWT + `withCredentials` için frontend origin ile API CORS/CSRF eşleşmesi gerekir. Backend: `CSRF_TRUSTED_ORIGINS`, `CORS_EXTRA_ORIGINS` — [[Backend_Environment]].

---

### `NEXT_PUBLIC_POS_OFFLINE_QUEUE`

| | |
|--|--|
| **Varsayılan (üretim)** | `true` — `install.sh` ve `update.sh` otomatik yazar |
| **Varsayılan (geliştirme)** | `false` — `frontend/.env.example` |
| **Değerler** | `true` / `false` |
| **Etki** | `true` → IndexedDB offline kuyruk, otomatik senkron, uzlaşma UI ([[POS_Offline_Queue]]) |
| **Runtime** | `runtime-config.json` → `posOfflineQueue` |

Üretim kurulumunda `install.sh` → `_write_frontend_env_files()` bu anahtarı `true` yazar. Mevcut sunucularda `update.sh` → `_merge_frontend_env_prod_defaults()` eksik/`false` değerleri `true` yapar; değişiklik olduysa frontend rebuild önerilir.

Staging pilot: `frontend/.env.staging.example` (`true`).

Backend önkoşul: `orders` migration (PosIdempotencyRecord), CSRF/CORS staging origin.

---

### `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS`

| | |
|--|--|
| **Varsayılan** | Production'da kapalı; dev'de açık eğilimli |
| **Değerler** | `true` / `false` |
| **Etki** | Axios interceptor hata toast'ları (`apiToastPolicy.ts`) |
| **Runtime** | `runtime-config.json` → `apiInterceptorToasts` |

Staging operasyonel debug için `true` kullanılabilir.

---

## Geliştirme-only değişkenler (`next.config.ts`)

| Değişken | Açıklama |
|----------|----------|
| `ALLOWED_DEV_ORIGINS` | Virgülle ek dev origin (telefon/tablet LAN testi). `NEXT_PUBLIC_API_URL` hostname'i otomatik eklenir |
| `ANALYZE` | `true` → bundle analyzer |
| `NODE_ENV` | Next.js tarafından set edilir |

`RAMIS_RUNTIME_CONFIG_PATH` — sunucu tarafı runtime JSON yolu override (`readRuntimeConfigFile.ts`); normalde `/etc/ramis/runtime-config.json`.

---

## Ölçeklendirme ve performans (frontend)

Ramis masa servisi segmentinde frontend **build-time** ayarları performansı doğrudan ölçeklemez; asıl darboğaz backend + WS'tir ([[Backend_Environment]]).

| Konu | Not |
|------|-----|
| API URL / IP | Runtime config kullanın; her IP değişiminde rebuild yapmayın |
| Offline kuyruk | Üretimde `install.sh` / `update.sh` ile varsayılan **açık**; geliştirmede kapalı. IndexedDB + senkron ek yük getirir — bkz. [[POS_Offline_Queue]] |
| PWA / Serwist | Production build'de aktif; `/api/` istekleri cache'lenmez ([[PWA]]) |
| `removeConsole` | Production'da `console.log` strip (error/warn kalır) |

---

## `update.sh` entegrasyonu

| Komut | Ne yapar |
|-------|----------|
| `--change-ip [IP]` | `backend.env` + `frontend.env` + `runtime-config.json` + nginx; `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` korunur |
| `--sync-runtime-config` | `_merge_frontend_env_prod_defaults()` + `frontend.env` → `/etc/ramis/runtime-config.json` |
| Normal `update.sh` / `--frontend-only` | `_merge_frontend_env_prod_defaults()`; `NEXT_PUBLIC_*` değiştiyse frontend **yeniden build** tetiklenebilir |

`_merge_frontend_env_prod_defaults()` — EPIC-07: `/etc/ramis/frontend.env` içinde `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` üretim varsayılanını uygular, `.env.local` ve runtime JSON senkronize eder.

`_write_runtime_config_json()` — `NEXT_PUBLIC_POS_OFFLINE_QUEUE` ve `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS` JSON'a yansır; varsayılan `posOfflineQueue: true`.

---

## İlgili okuma

- Backend eşleştirme: [[Backend_Environment]]
- Offline POS: [[POS_Offline_Queue]]
- API istemcisi: [[API_Client]]
- Kurulum: [[Deployment]]
