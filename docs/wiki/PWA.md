# PWA (Progressive Web App)

> **Özet:** Serwist (Workbox tabanlı) ile Service Worker yönetimi. Çevrimdışı destek, cache stratejileri ve yüklenebilir uygulama deneyimi sunar.
> **Kütüphaneler:** Serwist 9, @serwist/turbopack
> **Bağlantılar:** [[Frontend_Architecture]], [[Deployment]]

---

## Konum
- `frontend/src/app/sw.ts` — Service Worker kaynağı
- `frontend/src/app/serwist/` — Serwist yapılandırması
- `frontend/src/components/pwa/SerwistProvider.tsx` — Provider bileşeni
- `frontend/src/app/manifest.ts` — Web App Manifest
- `frontend/src/app/offline/` — Çevrimdışı sayfa

## Yapılandırma
- Development'ta devre dışı (`process.env.NODE_ENV === "development"`)
- `reloadOnOnline` — İnternet gelince yeniden yükle (offline kuyruk flush ile koordinasyon: bkz. [[POS_Offline_Queue]])
- Next.js Turbopack entegrasyonu (`@serwist/turbopack`)

## Manifest
- Uygulama adı: "Ramis ERP"
- İkonlar: 192x192 ve 512x512 PNG
- Apple Web App destekli
