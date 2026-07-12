# 🖥️ KDS Electron Uygulaması

> **Özet:** Mutfak Gösterim Sistemi (KDS) için geliştirilmiş bağımsız bir masaüstü (Electron.js) uygulamasıdır. Next.js standalone sunucusunu yerel olarak başlatır, otomatik giriş (auto-login) ve güvenli kimlik doğrulama yönetimini sağlar.

- **Kütüphaneler:** Electron.js, TypeScript, Node.js, Next.js Standalone
- **Bağlantılar:** [[Frontend_KDS]], [[Auth_Flow]], [[Standalone_Deploy]], [[Electron_KDS_Prep_Window]]

---

## 🏗️ Mimari Yapı

KDS Electron uygulaması (`electron_apps/kds` altında yer alır) şu ana bileşenlerden oluşur:
1. **Server Manager (`serverManager.ts`):** Next.js standalone sunucusunu dinamik boş bir port atayarak başlatır ve API adresini (`NEXT_PUBLIC_API_URL`) ortam değişkeniyle enjekte eder.
2. **Main Process (`main.ts`):** Uygulama yaşam döngüsünü, auto-login doğrulamasını ve KDS arayüzünü barındıran pencereyi yönetir.
3. **Login UI (`login.html`):** İlk kez başlatıldığında veya çıkış yapıldığında gösterilen şık ve karanlık mod uyumlu native giriş ekranıdır.
4. **Preload Script (`preload.ts`):** ContextBridge aracılığıyla ana süreç ile web sayfası arasında güvenli IPC iletişimi kurar ve kimlik doğrulama token/cookie bilgilerini Next.js tarafına enjekte eder.
5. **Kiosk Yöneticisi (`kiosk.ts`):** Uygulamanın tam ekran ve kiosk moduna geçmesini, çıkış tuşlarının engellenmesini veya yönetilmesini sağlar.
6. **System Tray (`tray.ts`):** İşletim sistemi tepsisinde çalışarak hızlı kapatma ve menü seçeneklerini sunar.

## 🔑 Giriş ve Oturum Yönetimi
- Başarılı giriş sonrasında kullanıcının kimlik bilgileri güvenli bir şekilde `userData` dizinindeki `config.json` dosyasına yazılır.
- Sonraki açılışlarda bu bilgiler okunarak otomatik giriş (`validateLogin`) yapılır.
- Sayfa içi çıkış (logout) istekleri yakalanarak kimlik bilgileri silinir ve kullanıcı tekrar native login ekranına yönlendirilir.

## Yetki Doğrulama ve Mesajlar
- KDS login doğrulaması sadece `orders.view_kds` izni olan kullanıcıları kabul eder (`KDS_REQUIRED_PERMISSION`).
- İzin yetersizliğinde locale bazlı mesaj katmanı (`electron/messages.ts`) kullanılır:
  - `tr`, `en`, `bg`, `sq`
- Login ekranı `permission_denied` hata kodu ile yerelleştirilmiş uyarı gösterebilir.

## Son Güncellemeler
- CLI’den tek adım logout için `--log-out` desteği eklendi (çalışan instance’a da sinyal verebilir).
- KDS içinden `window.open` ile açılan istasyon ekranı pencereleri sadece güvenli localhost/KDS route’larına whitelist ile izin verir.
- Core route guard, locale önekli KDS path’lerini de (`/tr/kds/...`) geçerli kabul eder.
