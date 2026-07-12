# React Native Garson Uygulaması Implementasyon Planı

Bu dosya, `mobile_app/waiter` dizini altında geliştirilecek olan React Native uygulamasının teknik detaylarını ve geliştirme adımlarını içerir.

## 1. Mimari Kararlar

### Teknoloji Seçimi
- **Expo (Managed Workflow):** Native modüllere erişim ihtiyacı düşük olduğu ve geliştirme hızı kritik olduğu için tercih edildi.
- **TypeScript:** API modelleriyle senkronizasyon ve hata payını azaltmak için zorunludur.
- **NativeWind:** Tailwind CSS deneyimini mobil tarafa taşır, web tarafındaki tasarım sistemiyle görsel uyumu kolaylaştırır.
- **Zustand:** Web tarafındaki state yönetim mantığını birebir kopyalamaya olanak tanır (örn. `useAuthStore`, `usePosStore`).

### Dizin Yapısı
Uygulama modern **Expo Router** yapısını kullanacaktır:
- `app/`: Yönlendirme (auth, main, modal katmanları).
- `src/api/`: Axios yapılandırması ve servisler.
- `src/components/`: Atomik UI bileşenleri.
- `src/store/`: Zustand state tanımları.
- `src/hooks/`: Veri çekme ve iş mantığı hookları.

## 2. Geliştirme Fazları

### Faz 1: Altyapı ve Auth (Hafta 1) - Tamamlandı!
- Projenin `npx create-expo-app` ile başlatılması.
- NativeWind ve Font yapılandırması.
- **JWT Auth:** Login ekranı, token saklama (`SecureStore`) ve Axios interceptor kurulumu.
- **Vardiya Kapısı:** Uygulama açılışında şube vardiya durumunun kontrolü.

### Faz 2: Masa ve Bölge Yönetimi (Hafta 2) - Tamamlandı!
- Şube bölgelerinin (`Zone`) yatay kaydırmalı veya tab yapısında listelenmesi.
- Masaların (`Table`) durumlarına göre (Boş, Dolu, Bekleyen) renk kodlarıyla listelenmesi.
- **WebSocket:** `[[WebSocket_Architecture]]` üzerinden masa durumlarının anlık güncellenmesi.

### Faz 3: Sipariş ve Menü (Hafta 3) - Tamamlandı!
- Menü kategorileri ve hızlı ürün arama.
- **Ürün Kartı:** Varyant seçimi, modifier (ekstra/çıkarılan) seçimi ve özel notlar.
- **Sipariş Sepeti:** Toplu sipariş onayı ve backend'e gönderim.
- **Smart Firing Entegrasyonu:** Siparişlerin mutfak önceliğine göre zamanlanması.
- Menü kategorileri ve hızlı ürün arama.
- **Ürün Kartı:** Varyant seçimi, modifier (ekstra/çıkarılan) seçimi ve özel notlar.
- **Sipariş Sepeti:** Toplu sipariş onayı ve backend'e gönderim.
- **Smart Firing Entegrasyonu:** Siparişlerin mutfak önceliğine göre zamanlanması.

### Faz 4: Ödeme ve Hesap (Opsiyonel/Ekran) - Tamamlandı!
- Masa hesabının önizlemesi.
- Fiş yazdırma talebi gönderimi (PrintJob kuyruğuna ekleme).

## 3. Backend Entegrasyon Notları
- Uygulama, `backend/` üzerinde çalışan mevcut REST API uç noktalarını kullanacaktır.
- **Gerekli API'ler:**
  - `GET /api/v1/branches/current/zones/`: Bölge ve masalar için.
  - `GET /api/v1/menu/active/`: Güncel menü için.
  - `POST /api/v1/orders/create_bulk/`: Sipariş gönderimi için.
  - `WS /ws/branch/{id}/`: Anlık güncellemeler için.

## 4. Kurulum ve Başlatma
Proje başlatıldığında şu komutlarla geliştirme ortamı kurulmalıdır:
```bash
cd mobile_app/waiter
npm install
npx expo start
```

## 5. Expo Dev EAS Kurulumu ve Derleme İşlemleri

Bu proje **Expo Application Services (EAS)** altyapısını kullanmaktadır. `eas.json` dosyası üç profil tanımlar: `development`, `preview` ve `production`. Aşağıdaki adımlar ilk kurulumdan dağıtıma kadar tüm süreci kapsar.

### 5.1 Ön Koşullar

```bash
# EAS CLI global kurulum (bir kez yapılır)
npm install -g eas-cli

# Expo hesabına giriş
eas login

# Hesap bağlantısını doğrula
eas whoami
```

> **Not:** Proje `owner: skocadogan` ve `projectId: b8a93cb5-f433-45b8-b3f8-c575e2612fde` ile Expo hesabına zaten bağlıdır. `eas.json` içindeki `cli.version >= 18.13.0` kısıtına dikkat edin.

---

### 5.2 Profil Açıklamaları (`eas.json`)

| Profil | Amaç | Dağıtım | Android Çıktı |
|--------|------|---------|---------------|
| `development` | Geliştirici cihazında `expo-dev-client` ile çalışma | Internal | `.apk` |
| `preview` | Ekip içi test / QA | Internal | `.apk` |
| `production` | Canlı yayın, otomatik versiyon artışı | Store | `.apk` |

- **`appVersionSource: remote`** — Versiyon numarası EAS bulutundan yönetilir; `app.json`'daki `version` alanı yalnızca başlangıç değeridir.
- **`autoIncrement: true`** (production) — Her production build'de `versionCode` otomatik artar.

---

### 5.3 Development Build (Geliştirici APK'sı)

Development build, standart Expo Go yerine **expo-dev-client** içeren özel bir istemci APK'sıdır. Yerel native modülleri (`expo-audio`, `expo-secure-store` vb.) cihazda test etmek için gereklidir.

```bash
cd mobile_app/waiter

# EAS bulutunda Android development APK derle
eas build --profile development --platform android

# İsteğe bağlı: Lokal makinede derle (Android SDK gerekir)
eas build --profile development --platform android --local
```

Build tamamlandığında indirme linki terminale düşer. APK'yı fiziksel cihaza veya emülatöre yükle:

```bash
# ADB ile doğrudan yükleme
adb install <indirilen-apk-yolu>
```

Cihaza APK yüklendikten sonra geliştirme sunucusunu başlatın:

```bash
npx expo start --dev-client
```

---

### 5.4 Preview Build (Ekip İçi Test)

Ekip üyelerine veya test cihazlarına dağıtmak için kullanılır. Expo Dev Client **gerektirmez**, standalone çalışır.

```bash
eas build --profile preview --platform android
```

Build sonrasında paylaşılan link ile takım APK'yı doğrudan indirebilir.

---

### 5.5 Production Build (Canlı Yayın)

```bash
# Production APK derle (versionCode otomatik artar)
eas build --profile production --platform android

# Tüm platformlar için aynı anda
eas build --profile production --platform all
```

> **Dikkat:** `android.buildType: "apk"` seçili olduğu için Play Store'a doğrudan yükleyemezsiniz. Play Store için `buildType: "app-bundle"` (`.aab`) kullanın. Şu anki yapılandırma dahili dağıtım / kurumsal kullanım içindir.

---

### 5.6 OTA Güncelleme (Over-the-Air)

JavaScript bundle değişikliklerini store güncellemesi gerektirmeden cihazlara iletmek için:

```bash
# Tüm cihazlara (production kanalına) güncelleme gönder
eas update --branch production --message "Hotfix: sipariş düzeltmesi"

# Preview kanalına gönder
eas update --branch preview --message "Yeni özellik testi"
```

> OTA güncellemeleri yalnızca **JS/TS ve asset** değişikliklerini kapsar. Native kod değişiklikleri (yeni plugin, izin vb.) için tam EAS build gerekir.

---

### 5.7 Build Durumu İzleme

```bash
# Son build'leri listele
eas build:list

# Belirli bir build'in detaylarını gör
eas build:view <build-id>
```

Ayrıca [https://expo.dev/accounts/skocadogan/projects/waiter/builds](https://expo.dev/accounts/skocadogan/projects/waiter/builds) adresinden tüm build geçmişi ve loglar izlenebilir.

---

### 5.8 Sık Karşılaşılan Sorunlar

| Sorun | Çözüm |
|-------|-------|
| `eas-cli` versiyon uyumsuzluğu | `npm install -g eas-cli@latest` ile güncelle |
| `NSAllowsArbitraryLoads` uyarısı | `app.json`'da zaten tanımlı; production öncesi kaldır |
| APK cihaza yüklenmiyor | Cihazda "Bilinmeyen kaynaklara izin ver" ayarını aç |
| `usesCleartextTraffic` gereksinimi | `expo-build-properties` eklentisi `app.json`'da yapılandırıldı; LAN API bağlantısı için zorunludur |
| Dev build'de WebSocket bağlanamıyor | Sunucunun LAN IP'sini (`192.168.0.11`) ve cihazın aynı ağda olduğunu kontrol et |

---

*Hazırlayan: Sedat Kocadoğan (Baş Mimar)*
