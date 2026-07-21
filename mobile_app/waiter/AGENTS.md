# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

## Yapılandırma Notları

- `app.json` → `extra.apiUrl` değerindeki `YOUR_SERVER_IP` / `RAMISSERVER_IP` kısmını gerçek sunucu IP'siyle değiştirin.
  - Tercihen HTTPS: `"apiUrl": "https://192.168.1.100/api/v1"`
  - Yerel LAN HTTP gerekiyorsa `http://...` kullanılabilir; Android `usesCleartextTraffic` bu yüzden açıktır.
- Statik IP'yi kaynak kontrolüne taşımayın; `.env` veya EAS Secrets kullanın.

## Önemli Mimari Kararlar

- **WebSocket yeniden bağlantısı**: Üstel geri-çekilme ile maks 30 s bekler (`useTableSync`, `useWaiterCallNotifications`).
- **Auth token önbelleği**: `src/api/client.ts` — `SecureStore` I/O'sunu sadece başlangıçta yapar, sonraki requestlerde bellek önbelleği kullanılır.
- **Hazır ürün polling**: WS her zaman anlık günceller; HTTP polling 90 s aralıkla sadece fallback olarak çalışır.
