# 🎨 Frontend Surveys (Arayüz & Müşteri Ekranı Entegrasyonu)

> **Özet:** Müşteri geri bildirim anketlerinin yönetim panelindeki CRUD işlemlerini, POS müşteri ekranındaki interaktif gösterimini ve Smart Table üzerindeki tablet akışını yöneten frontend modülüdür. Admin tarafında anket oluşturma/analiz etme sekmeleri sunarken, POS CFD ve Smart Table tarafında farklı kanal kurallarıyla survey doldurma deneyimi sağlar.
> **Kütüphaneler:** React 19, React Native, Expo Router, Zustand, TanStack Query, Tailwind CSS, Lucide React, `next-intl`
> **Bağlantılar:** [[Index]], [[Guest_Feedback]], [[Frontend_Architecture]], [[POS_Display]], [[State_Management]], [[Frontend_WebSocket]], [[Internationalization]]

---

## 🛠️ Yönetim Paneli (Admin SurveysTab)

Admin panelindeki anket yönetimi `frontend/src/features/admin/components/tabs/` altında iki ana bileşenle sağlanır:

### 1. `SurveysTab` (Anket Yönetim Sekmesi)
Anketlerin CRUD (Ekleme, Okuma, Güncelleme, Silme) operasyonlarını yürüten bileşendir.
- **Anket Formu (`SurveyFormDialog`):** Anket başlığı, açıklaması, şube atamaları, müşteri ekranı/akıllı masa aktiflik switch'leri ve dinamik soru ekleme arayüzünü içerir.
- **Dinamik Soru Oluşturma:** Soru tipi seçimine (`RATING`, `YES_NO`, `OPTION`, `SHORT_TEXT`) göre dinamik girdi alanları (örneğin seçenek listesi veya min-max puan sınırları) render edilir.
- **Dil Desteği:** `admin.json` dil dosyası üzerinden yerelleştirilmiş alanlar (`surveys.answerTypes`, `surveys.roles`) sunulur.

### 2. `SurveyResponsesDialog` (Anket Yanıtları Diyaloğu)
Gelen müşteri geri bildirimlerini ve NPS analizlerini listeler.
- **İlgi Gerektiren Yanıtlar:** `needs_attention=True` olan olumsuz geri bildirimler ayrı bir sekmede gösterilir ve yöneticiler tarafından `attention_status` (`OPEN`, `REVIEWED`, `RESOLVED`) bilgisi ile güncellenip inceleme notu eklenerek kapatılabilir.

---

## 🖥️ Müşteri Ekranı Gösterimi (Customer Display)

Müşteri ekranında anketin interaktif olarak doldurulması `CustomerDisplaySurveyModal` bileşeni ile gerçekleştirilir:

- **Adım Adım Gezinme (Wizard):** Sorular sırasıyla gösterilir. Bir soru cevaplanmadan zorunlu bir sonraki soruya (`is_required`) geçilmesine izin verilmez.
- **Soru Tipi Renderer'ları:**
  - `RATING`: 1-5 yıldız veya 0-10 NPS buton grid'i.
  - `YES_NO`: Büyük "Evet" ve "Hayır" butonları.
  - `OPTION`: Tekli seçim yapılabilen buton listesi.
  - `SHORT_TEXT`: Metin giriş alanı (`Textarea`).
- **Endpoint Entegrasyonu:**
  - Tamamlandığında `/guest-feedback/display/submit/` adresine post edilerek yanıtlar kaydedilir.
  - Teşekkür mesajı gösterildikten 2 saniye sonra otomatik kapanır.
  - Kapatılmak istendiğinde `/guest-feedback/display/close/` endpoint'i çağrılır.

---

## 📱 Smart Table Survey Akışı

Smart Table survey deneyimi, POS CFD akışından bağımsızdır ve React Native istemcisi içinde global bir modal host ile yürütülür.

### Ana Bileşenler

- `mobile_app/smart_table/src/components/survey/SmartTableSurveyHost.tsx`
- `mobile_app/smart_table/src/store/survey-store.ts`
- `mobile_app/smart_table/src/services/surveyService.ts`
- `mobile_app/smart_table/app/(tabs)/menu.tsx`
- `mobile_app/smart_table/src/components/waiter/WaiterCallScreen.tsx`

### Akış

1. **Header butonu:** Menü ekranındaki top bar, aktif sipariş varken manuel survey açılışı için giriş noktası sağlar.
2. **Hesap çağrısı:** Kullanıcı Smart Table üstünden `BILL` çağrısı gönderir ve backend çağrıyı kabul ederse survey onay ekranı açılır.
3. **Hazır sipariş gecikmeli daveti:** Tüm aktif siparişler hazır/on-the-way seviyesine geldikten yaklaşık 3.5 dakika sonra survey onay ekranı gösterilir.
4. **Survey seçimi / doldurma:** Tek survey varsa doğrudan açılır; birden fazla survey varsa seçim yüzeyi gösterilir.
5. **Teşekkür ve suppress:** Cevap sonrası teşekkür durumu gösterilir ve aynı masa döngüsünde aynı survey yeniden listelenmez.

### Endpoint Entegrasyonu

- `GET /guest-feedback/smart-table/available/`
- `POST /guest-feedback/smart-table/open/`
- `POST /guest-feedback/smart-table/submit/`
- `POST /guest-feedback/smart-table/close/`

`available` yanıtı `surveys[]` yanında `has_answered_survey` döndürür. Header butonuna basıldığında survey kalmadıysa:
- `has_answered_survey=true` ise “anketi cevapladınız” mesajı,
- aksi halde “aktif anket yok” mesajı gösterilir.

### Root Host Kararı

`SmartTableSurveyHost`, `mobile_app/smart_table/app/_layout.tsx` içine monte edilir. Bu yüzden aktif sipariş bağlamı varsa survey onay ekranı sadece tab ekranlarında değil karşılama ekranı üzerinde de açılabilir; bu davranış bilerek route bazında sınırlandırılmamıştır.

### POS Satış Detayı ile İlişki

Web frontend tarafında `frontend/src/features/tables/components/TableOrderModal/index.tsx`, mevcut `customer_display_survey_answered` alanını kullanmaya devam eder. Backend bu alanı Smart Table `ANSWERED` oturumlarını da kapsayacak şekilde genişlettiği için POS tarafında ek bir UI mantığı yazmadan survey butonu disable olur.

---

## 🔄 WebSocket & State Senkronizasyonu

POS terminali (Kasiyer) ile Müşteri Ekranı (CFD) arasındaki anket akışı WebSocket katmanı üzerinden senkronize edilir:

1. **Kasiyer Ekranı:** Kasiyer ödeme ekranında anket butonuna bastığında, backend'de oturum açılır ve WebSocket ile anket şeması (`DisplaySurveyPrompt`) yayınlanır.
2. **`usePosDisplaySync` Hook'u:** Müşteri ekranındaki `SharedWebSocketHub` consumer'ı `"pos_display_survey"` tipinde bir event yakalar.
3. **State Güncellemesi:** Yakalanan prompt, POS store'daki `displaySurveyPrompt` alanına yazılır.
4. **Modal Tetiklenmesi:** Müşteri ekranı (CFD) `displaySurveyPrompt`'un dolu olduğunu algılayarak `CustomerDisplaySurveyModal` bileşenini tam ekran (fixed z-index) olarak render eder.
5. **Kapatma/Tamamlama:** Müşteri anketi bitirdiğinde veya kasiyer ekranı kapattığında gönderilen WebSocket sinyali ile modal ekrandan kaldırılır.

Smart Table survey akışı yeni bir WebSocket kanalı kullanmaz; mevcut `useOrderSync` ve `activeOrders` verisi üstünden zamanlama ve reset davranışı türetilir.

*Bu sayfa INGEST 2026-07-04 Smart Table survey operasyonu ile güncellenmiştir.*
