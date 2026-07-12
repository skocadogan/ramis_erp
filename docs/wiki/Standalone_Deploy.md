# Standalone Deploy (Next.js output: standalone)

> **Özet:** `next.config.ts` içinde `output: "standalone"` ayarı ile Next.js, `node_modules` yerine minimum bağımlılıkları `.next/standalone/` altında paketler. Production'da `next start` yerine `node .next/standalone/server.js` kullanılır.
> **Kütüphaneler:** Next.js, Node.js, systemd
> **Bağlantılar:** [[Deployment]], [[Runtime_Config]], [[Frontend_Architecture]]

---

## Neden Standalone?

| Konu | Klasik (`next start`) | Standalone (`node server.js`) |
|------|-----------------------|-------------------------------|
| `node_modules` boyutu | Tümü (~400–800 MB) | Yalnızca kullanılanlar (~50–150 MB) |
| Başlatma | `npm run start` gerekir | Sadece `node` yeterli |
| Deploy paketi | Büyük | Küçük |

`next start` ile `output: standalone` birlikte kullanılırsa Next.js 15+ şu uyarıyı verir:
```
"next start" does not work with "output: standalone" configuration.
Use "node .next/standalone/server.js" instead.
```

## Build Akışı

```
npm run build
    └─ next build --turbopack
    └─ postbuild: bash scripts/prepare-standalone.sh
         ├─ cp -a public/          → .next/standalone/public/
         └─ cp -a .next/static/    → .next/standalone/.next/static/
```

`prepare-standalone.sh` bu iki adımı zorunlu kılar; aksi hâlde CSS/JS statik dosyaları servis edilemez.

## `package.json` Komutları

```json
"build":     "next build --turbopack",
"postbuild": "bash scripts/prepare-standalone.sh",
"start":     "node .next/standalone/server.js"
```

## systemd Birimi (ramis-frontend.service)

```ini
[Service]
WorkingDirectory=/srv/ramis_erp/frontend/.next/standalone
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=-/etc/ramis/frontend.env
ExecStart=/usr/bin/node server.js
```

`PORT` değeri `frontend.env` içinden okunur (varsayılan: 3000). `HOSTNAME=127.0.0.1` → servis yalnızca localhost'a bağlanır; dışarıya Nginx (port 80) üzerinden ulaşılır.

## Kurulum / Güncelleme Akışı

`install.sh` (tam kurulum modunda) → `setup_systemd()` içinde:
1. `npm run build` → `postbuild` → `prepare-standalone.sh`
2. `.next/standalone/server.js` varlığı doğrulanır (yoksa die)
3. `ramis-frontend.service` `WorkingDirectory` ve `ExecStart` standalone için yazılır

`update.sh` → rebuild sonrası:
1. `_prepare_next_standalone()` — `prepare-standalone.sh` çalıştırır
2. `_write_ramis_frontend_systemd_unit()` — birim dosyasını günceller, `daemon-reload` yapar
3. Servis başlatılır

## Mevcut Kurulumu Taşıma

```bash
# 1. Rebuild (ilk kez standalone çıktısı üretir)
cd /srv/ramis_erp/frontend
sudo bash update.sh --frontend-only

# 2. Doğrulama
systemctl cat ramis-frontend.service | grep -E 'WorkingDirectory|ExecStart|HOSTNAME'
# WorkingDirectory=.../.next/standalone
# ExecStart=... node server.js

journalctl -u ramis-frontend -n 20 --no-pager
# "next start" uyarısı artık görünmemeli
```

## Frontend Kaynak Temizliği (Üretim)

`install.sh` ve `update.sh`, `npm run build` + servis doğrulaması tamamlandıktan sonra `/srv/ramis_erp/frontend/` altındaki kaynak dosyaları otomatik olarak temizler.

### `_cleanup_frontend_sources()`

| Davranış | Açıklama |
|----------|----------|
| Güvenlik kontrolleri | `standalone/server.js` yoksa ve `ramis-frontend` servisi çalışmıyorsa atlar |
| Silinen | `node_modules/`, `src/`, `app/`, `public/`, `package.json`, `tsconfig.json`, `next.config.*` vb. tüm kaynak dosya ve dizinler |
| **Korunan** | `.next/` (çalışan build çıktısı), `.env.local` (rsync hariç tutar), `scripts/` (`prepare-standalone.sh` barındırır) |

### Neden `scripts/` Tutulur?

`update.sh --change-ip` gibi modlarda `_prepare_next_standalone()` çağrısı `scripts/prepare-standalone.sh` scriptini çalıştırır. Bu script, `public/` ve `.next/static/` klasörlerini standalone dizinine kopyalar.

Temizlikten sonra `public/` kaynak dizini yoksa script bu adımı atlar, standalone dizinindeki `public/` olduğu gibi kalır — bu güvenlidir çünkü `postbuild` zaten kopyalamıştır.

```
/srv/ramis_erp/frontend/   (temizlik sonrası)
├── .next/
│   └── standalone/          ← systemd WorkingDirectory
│       ├── server.js
│       ├── public/           ← postbuild tarafından kopyalandı
│       └── .next/static/     ← postbuild tarafından kopyalandı
├── .env.local               ← korunur
└── scripts/
    └── prepare-standalone.sh ← korunur
```

Sonraki `update.sh` çalışmasında rsync kaynak dosyaları `${INSTALL_DIR}/frontend/` dizinine yeniden getirir; `npm run build` yeni postbuild ile standalone'u günceller ve temizlik tekrar tetiklenir.

## Dikkat Edilecekler

- Her `npm run build` sonrası `prepare-standalone.sh` otomatik çalışır (`postbuild`).
- `public/` veya `.next/static/` kopyalanmadan `server.js` başlatılırsa CSS/JS eksik kalır.
- `.next/standalone/` içindeki `node_modules` değiştirilmemeli; Next.js üretir.
- `NEXT_PUBLIC_*` değerleri hâlâ **build-time** gömülür; IP değişimlerinde [[Runtime_Config]] mekanizması devreye girer.
- Kaynak temizliği `ramis-frontend` çalışmıyorsa atlanır; başarısız build sonrası kaynak dosyalar korunur.
