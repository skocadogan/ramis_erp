# Runtime Config (Çalışma Zamanı Yapılandırması)

> **Özet:** Frontend'in API URL ve özellik bayraklarını (feature flags) Next.js rebuild gerektirmeden güncellemesini sağlayan katman. Sunucuda `/etc/ramis/runtime-config.json` dosyasından okunur; dosya yoksa `NEXT_PUBLIC_*` ortam değişkenlerine geri düşer.
> **Kütüphaneler:** Next.js App Router, `server-only`, `fs`
> **Bağlantılar:** [[Deployment]], [[Frontend_Architecture]], [[Django_Settings]], [[API_Client]], [[Frontend_Environment]]

---

## Neden Gerekli?

`NEXT_PUBLIC_*` değişkenleri Next.js **build zamanında** bundle içine gömülür. Sunucunun IP'si değiştiğinde yeniden build olmadan API adresini güncellemek için runtime config mekanizması kullanılır.

Tüm frontend env anahtarları ve ne zaman rebuild gerektiği: [[Frontend_Environment]].

## Dosya Yolu

```
/etc/ramis/runtime-config.json
```

Örnek içerik:
```json
{
  "apiBaseUrl": "http://192.168.0.10/api/v1",
  "posOfflineQueue": true,
  "apiInterceptorToasts": false
}
```

Sahip: `ramis:ramis`, izin: `644`.

## Öncelik Sırası (Cascading)

```
/etc/ramis/runtime-config.json   ← en yüksek öncelik
    ↓ (dosya yoksa)
same-origin /api/v1              ← Nginx proxy arkasında aynı IP'deyse
    ↓ (SSR snapshot yoksa)
NEXT_PUBLIC_API_URL              ← geliştirme / fallback
```

## Kaynak Dosyalar

| Dosya | Rol |
|-------|-----|
| `frontend/src/lib/runtimeConfig.ts` | Client-safe; `loadClientRuntimeConfig()`, `shouldPreferSameOriginApi()` |
| `frontend/src/lib/runtimeConfig.server.ts` | `server-only`; `getServerRuntimeConfig(appOrigin)`, `getRuntimeConfigPayloadForClient(appOrigin)`, `resolveAppOriginFromRequestHeaders()` |
| `frontend/src/lib/readRuntimeConfigFile.ts` | `server-only`; `fs` ile JSON okuma |
| `frontend/src/app/ramis/runtime-config/route.ts` | `GET /ramis/runtime-config` HTTP endpoint |
| `frontend/next.config.ts` | `/runtime-config.json` → `/ramis/runtime-config` rewrite (geriye uyum) |

## HTTP Endpoint

```
GET /ramis/runtime-config       (Next.js API route)
GET /runtime-config.json        (Nginx rewrite → yukarıdaki)
```

Client tarafı: `loadClientRuntimeConfig()` bu endpoint'i fetch eder; sunucu 404 dönerse SSR snapshot korunur.

## Dosya Oluşturma / Güncelleme

Dosya `install.sh` kurulumunda ve `update.sh` ile yazılır:

```bash
# Eski kurulumda dosya yoksa oluştur + EPIC-07 offline kuyruk varsayılanını uygula
sudo bash update.sh --sync-runtime-config

# IP değişince hem env hem runtime-config.json güncellenir
sudo bash update.sh --change-ip 192.168.x.x
```

| Betik | `posOfflineQueue` |
|-------|-------------------|
| `install.sh` | Kurulumda `true` (`_write_frontend_env_files`) |
| `update.sh` | `_merge_frontend_env_prod_defaults()` ile `NEXT_PUBLIC_POS_OFFLINE_QUEUE=true` zorunlu üretim varsayılanı |

`_write_runtime_config_json()` (`update.sh` / `install.sh`): `frontend.env`'deki `NEXT_PUBLIC_POS_OFFLINE_QUEUE` ve `NEXT_PUBLIC_API_INTERCEPTOR_TOASTS` değerleri JSON'a yansır. Anahtar yoksa varsayılan `posOfflineQueue: true`.

## Serwist / PWA Entegrasyonu

`sw.ts` içinde `/api/` ve runtime config endpoint'leri `NetworkOnly` stratejisi ile işaretlidir; service worker bu yolları önbelleğe almaz. Bkz: [[PWA]].
