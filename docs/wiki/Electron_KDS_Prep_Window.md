# Electron KDS Prep Window (İstasyon Hazırlık Kiosk)

> **Özet:** `electron_apps/kds-station-prep-window` uygulaması, istasyon hazırlık ekranını bağımsız bir kiosk olarak çalıştırır. İlk açılışta sadece API adresi alınır; şube/istasyon seçimi ve token oturumu frontend’de yapılır, sonra oturum config dosyasına kaydedilerek otomatik açılış sağlanır. Uygulama yalnızca `/kds/prep-window` rotasına izin verir.
> **Kütüphaneler:** Electron, TypeScript, Next.js standalone
> **Bağlantılar:** [[Prep_Display]], [[Frontend_KDS]], [[Frontend_WebSocket]], [[Electron_KDS]], [[Standalone_Deploy]]

---

## Konum
- `electron_apps/kds-station-prep-window/`

## Bileşenler

| Dosya | Rol |
|---|---|
| `electron/main.ts` | App lifecycle, setup/config akışı, kiosk pencere yönetimi |
| `electron/serverManager.ts` | Next standalone başlatma, runtime config yazma, crash recovery |
| `electron/preload.ts` | Renderer’a `electronAPI` köprüsü ve session enjeksiyonu |
| `electron/setup.html` | API URL alma ekranı |
| `electron/kiosk.ts` | Kiosk/fullscreen toggle yardımcıları |
| `electron/tray.ts` | Tray menüsü (Göster, Yeniden Yükle, Çıkış) |

## Çalışma Akışı
1. Uygulama açılır, `config.json` okunur.
2. `apiUrl` yoksa `setup.html` açılır.
3. `apiUrl` varsa Next server ayağa kalkar ve `/kds/prep-window` yüklenir.
4. Frontend tarafı `prep-window-session` verisini doğrular (`/prep-display/verify/`).
5. Geçerli token varsa direkt ekran, yoksa setup fazına geri dönüş.

## Konfigürasyon Modeli
- Dosya: `app.getPath("userData")/config.json`
- Tutulan alanlar:
  - `apiUrl`
  - `locale`
  - `displayToken`
  - `branchId`
  - `stationId`
  - `station` (id/name/color/branch)

`--reset-setup` CLI parametresi:
- Sadece istasyon oturum alanlarını temizler
- API URL korunur
- Uygulama setup fazına geri döner

## IPC Sözleşmeleri
- `prep-window:save-api-url`
- `prep-window:get-config`
- `prep-window:get-session` (sync)
- `prep-window:save-config`
- `prep-window:reset-config`
- `kiosk:toggle`
- `app:quit`

## Rota Güvenliği
- `isPrepWindowRoute()` ile localhost portunda whitelist yaklaşımı:
  - izinli: `/_next/*`, `/static/*`, `/sounds/*`, `/ramis/runtime-config`, `/kds/prep-window...`
  - engelli: diğer tüm route’lar → otomatik `/kds/prep-window` yönlendirmesi
- `will-navigate` ve `did-navigate-in-page` event’lerinde zorlanır

## Runtime Config
- `serverManager` her açılışta `runtime-config.json` yazar
- `apiBaseUrl` değeri Electron setup’tan gelen backend adresinden üretilir
- Frontend API çağrıları build-time yerine runtime config ile çözülür
