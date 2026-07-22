# 🖥️ POS Electron Uygulaması

> **Özet:** Satış Noktası (POS) sistemi için geliştirilmiş bağımsız bir masaüstü (Electron.js) uygulamasıdır. Next.js standalone sunucusunu yönetir, çoklu ekran desteği sağlayarak ana ekranı birinci monitörde, müşteri ekranını ise ikinci monitörde otomatik açar.

- **Kütüphaneler:** Electron.js, TypeScript, Node.js, Next.js Standalone
- **Bağlantılar:** [[Frontend_POS]], [[POS_Display]], [[Auth_Flow]], [[Standalone_Deploy]]

---

## 🏗️ Mimari Yapı

POS Electron uygulaması (`electron_apps/pos` altında yer alır) şu ana bileşenlerden oluşur:
1. **Server Manager (`serverManager.ts`):** Next.js standalone sunucusunu dinamik boş bir port atayarak başlatır ve API adresini enjekte eder. Packaged (AppImage) modda sunucu `userData/next-server` altına kopyalanır; yenileme anahtarı `appVersion:BUILD_ID` stamp’idir (yalnızca `package.json` sürümü değil — frontend rebuild’i de cache’i geçersiz kılar).
2. **Main Process (`main.ts`):** Uygulama pencerelerini, auto-login doğrulamalarını ve çoklu ekran mantığını yönetir.
3. **Login UI (`login.html`):** Kasiyerlerin PIN kodu veya standart şifreyle girebildiği sanal sayısal tuş takımlı (virtual keypad) native giriş arayüzüdür.
4. **Preload Script (`preload.ts`):** ContextBridge ile web sayfası arasında IPC iletişimi kurar. Kasiyerin web sayfasında yaptığı terminal seçim değişikliklerini (`pos_prefs` ve `auth-storage`) localStorage üzerinden okuyup ana sürece (`pos:terminal-selected`) bildirir.
5. **Request Monitoring & Media Proxy (`main.ts`):** Next.js sunucusundan gelen görsellerin localde bulunamaması sorununu çözmek için `/media/` ve `/_next/image?url=/media/...` isteklerini yakalayarak doğrudan Django Backend API sunucusuna vekil (proxy) olarak yönlendirir.

## 📺 Çoklu Monitör ve Müşteri Ekranı Desteği
- Uygulama başlatıldığında `screen.getAllDisplays()` ile bilgisayardaki ekran sayısı tespit edilir.
- Birincil monitörde ana POS arayüzü (`mainWindow`) pencereli maximized modda başlatılır.
- İkinci bir monitör algılanırsa, müşteri ekranı (`displayWindow`) ikinci ekran üzerinde tam ekran (kiosk modunda) otomatik olarak açılır.
- Kasiyer bir terminal seçtiğinde veya değiştirdiğinde, arka planda otomatik olarak Django API'den WebSocket abonelik token'ı alınır ve müşteri ekranı `/pos/display/{terminalId}` URL'si ile ikinci pencereye yüklenir.
- Çıkış yapıldığında (logout) ikinci ekran penceresi otomatik olarak yok edilir.
