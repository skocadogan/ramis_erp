# 📝 Guest Feedback (Müşteri Geri Bildirimi & Anketler)

> **Özet:** Projede şube bazlı anket yönetimi, anket sorularının oluşturulması, anket oturumu durumlarının takibi ve müşteri yanıtlarının kaydedilmesini sağlayan backend modülüdür. NPS, yemek, servis, hız ve temizlik gibi analitik rollere göre müşteri puanlamaları izlenir ve düşük puanlarda ilgi takibi (`needs_attention`) tetiklenir; aynı altyapı hem POS müşteri ekranı hem de [[Smart_Table]] için ayrı kanal davranışlarıyla kullanılabilir.
> **Kütüphaneler:** Django 6, Django REST Framework, Django Channels (WebSocket)
> **Bağlantılar:** [[Index]], [[Frontend_Surveys]], [[POS_Display]], [[WebSocket_Architecture]], [[Audit_Trail]], [[Branches]], [[Customers]], [[Sales]], [[Orders]]

---

## 💾 Veri Modelleri

Müşteri geri bildirim sistemi, `backend/apps/guest_feedback/models.py` içinde tanımlanan şu ana modeller üzerine kuruludur:

### 1. `Survey` (Anket)
Anketlerin genel adını, açıklamasını ve aktiflik durumunu tutan kök modeldir.
- `branches` (ManyToMany): Bir anketin hangi şubelerde geçerli olduğunu tanımlar.
- `is_customer_display_active` (Boolean): Müşteri ekranında (CFD) aktif olup olmadığını belirtir.
- `is_smart_table_active` (Boolean): [[Smart_Table]] üzerinde aktif olup olmadığını belirtir.

### 2. `SurveyQuestion` (Anket Sorusu)
Ankete bağlı soruları ve soru tiplerini tanımlar.
- `answer_type` (Rating, Yes/No, Option, Short Text): Soruya verilecek yanıtın veri tipini ve UI kontrolünü belirler.
- `question_role` (NPS, Food, Service, Speed, Cleanliness, None): Sorunun analitik raporlamalarda ve denormalize alanlarda hangi kritere karşılık geldiğini belirtir.
- `rating_min_value` / `rating_max_value`: Değerlendirme tipi sorular için sınır değerler (varsayılan 1-5, NPS için 0-10).
- `is_required` (Boolean): Sorunun zorunlu olup olmadığını belirler.

### 3. `SurveyQuestionOption` (Soru Seçeneği)
Çoktan seçmeli (`OPTION`) soru tipleri için tanımlanmış seçeneklerdir.

### 4. `TableSurveySessionState` (Masa Anket Oturum Durumu)
Her anket doldurma girişimini veya POS ekranındaki anket davetini takip eden oturum kaydıdır.
- `session_key` (Unique): Oturumu benzersiz kılmak için `source:sale:<sale_id>` veya `source:order:<order_id>` formatında oluşturulur.
- `status` (`OPENED` | `ANSWERED` | `CLOSED`): Oturumun o anki aşamasını gösterir.
- `pos_terminal`: Oturumun açıldığı POS terminalini belirtir.
- `source` (`POS_DISPLAY` | `SMART_TABLE`): Anketin doldurulduğu kanalı tanımlar.

### 5. `SurveyResponse` (Anket Yanıtı)
Müşterinin ankete verdiği genel yanıttır ve `TableSurveySessionState` ile birebir (`OneToOne`) ilişkilidir.
- **Denormalize Puanlar:** Hızlı analiz ve filtreleme için `nps_score`, `food_rating`, `service_rating`, `speed_rating`, `cleanliness_rating` gibi analitik rol puanları doğrudan bu tabloya yazılır.
- **İlgi Takibi (`needs_attention`):** Eğer NPS skoru 0-6 arasındaysa veya diğer derecelendirmelerde 1-2 puan verilmişse, ya da Evet/Hayır sorularına olumsuz (False) yanıt verilmişse sistem otomatik olarak `needs_attention=True` atar.
- `attention_status` (`OPEN` | `REVIEWED` | `RESOLVED`): Olumsuz geri bildirimlerin yönetim panelinde incelenme durumunu takip eder.

### 6. `SurveyAnswer` (Soru Yanıtı)
Her soruya verilen tekil cevabı tutar. Seçilen seçenek, puan değeri, evet/hayır durumu veya kısa metin bu modelde saklanır.

---

## ⚙️ Servis Katmanı ve WebSocket Yayını

Tüm iş mantığı `backend/apps/guest_feedback/services.py` içinde kapsüllenmiştir:

### 1. Oturum Açma: `open_customer_display_survey`
POS terminalinde işlem tamamlandığında veya ödeme adımında müşteri ekranında anket başlatmak için çağrılır.
- İlgili şubede aktif olan müşteri ekranı anketi (`get_active_customer_display_survey`) bulunur.
- Benzersiz bir `session_key` oluşturularak `TableSurveySessionState` kaydı açılır (ya da güncellenir).
- `broadcast_display_survey_event` aracılığıyla `pos_display_{terminal_code}` WebSocket grubuna `'action': 'open'` ve anket şeması (`DisplaySurveyPromptSerializer`) yayınlanır.

### 2. Yanıt Gönderme: `submit_customer_display_survey`
Müşteri ekranından gelen anket yanıtlarını doğrulamak ve kaydetmek için çağrılır.
- Gelen yanıtların zorunluluk durumu ve puan aralıkları doğrulanır.
- `SurveyResponse` kaydı oluşturulur. Eğer kriterler olumsuz ise `needs_attention=True` yapılır ve `attention_status = OPEN` set edilir.
- `SurveyAnswer` kayıtları toplu olarak (`bulk_create`) eklenir.
- Oturum durumu `ANSWERED` olarak güncellenir.
- WebSocket ile müşteri ekranına `'action': 'close'` ve `'completion_signal': 'PAYMENT'` sinyali gönderilir.

### 3. Kapatma: `close_customer_display_survey`
Anket doldurulmadan kapatılırsa veya süresi dolarsa çağrılır.
- Oturum durumu `CLOSED` yapılır.
- WebSocket ile müşteri ekranına kapatma (`'action': 'close'`) komutu gönderilir.

### 4. Smart Table Akışı: `get_active_smart_table_surveys`, `open_smart_table_survey`, `close_smart_table_survey`
Smart Table survey akışı POS müşteri ekranı yayın zincirinden bağımsızdır:
- `get_active_smart_table_surveys`: Şube bazlı aktif Smart Table survey'lerini getirir ve aynı masada daha önce `ANSWERED` durumuna düşmüş survey'leri listeden çıkarır.
- `open_smart_table_survey`: `SMART_TABLE:order:<order_id>` session anahtarı ile sipariş bazlı survey oturumu açar; `pos_terminal` kullanılmaz.
- `close_smart_table_survey`: Smart Table istemcisi survey akışını kapattığında ilgili session'ı `CLOSED` durumuna alır.

### 5. Satış Eşleştirme ve Reset: `attach_sale_to_survey_records`, `reset_smart_table_survey_sessions_for_table`
Sipariş henüz ödenmeden (sipariş aşamasında) açılan anket oturumları, ödeme tamamlanıp [[Sales]] kaydı oluştuktan sonra bu servis vasıtasıyla ilgili satışla (`sale`) eşleştirilir.
- `attach_sale_to_survey_records`: `order` ile açılmış survey session ve response kayıtlarına oluşan `sale` bilgisini geri doldurur.
- `reset_smart_table_survey_sessions_for_table`: Smart Table ödeme akışından sonra ilgili masadaki aktif Smart Table session'larını pasife çeker; böylece masa resetinden sonra yeni döngü temiz başlar.

## 🌐 API Yüzeyleri

### POS Customer Display Endpoint'leri
- `POST /api/v1/guest-feedback/display/open/`
- `GET /api/v1/guest-feedback/display/current/<terminal_code>/`
- `POST /api/v1/guest-feedback/display/submit/`
- `POST /api/v1/guest-feedback/display/close/`

Bu yüzeyler `PosTerminal`, display token ve WebSocket yayını ile sıkı bağlıdır.

### Smart Table Endpoint'leri
- `GET /api/v1/guest-feedback/smart-table/available/`
- `POST /api/v1/guest-feedback/smart-table/open/`
- `POST /api/v1/guest-feedback/smart-table/submit/`
- `POST /api/v1/guest-feedback/smart-table/close/`

Smart Table yüzeyi JWT ile korunan normal API çağrılarıdır; yeni WebSocket kanalı açmaz. `available` yanıtı sadece gösterilebilir survey listesini değil, aynı masa için daha önce Smart Table üzerinden cevap verilmişse `has_answered_survey=true` işaretini de döner. Bu sayede istemci “aktif anket yok” ile “anketi zaten cevapladınız” durumlarını ayırabilir.

---

## 🔒 Yetkilendirme ve Kapsam

Anketlerin ve yanıtların erişim denetimi [[Branch_Scope]] ve [[RBAC]] sistemine entegredir:
- `get_accessible_surveys_queryset(user)`: Kullanıcının sadece kendi yetkili olduğu şubelere ait anket tanımlarını görmesini sağlar.
- `get_accessible_responses_queryset(user)`: Kullanıcının yetkili olduğu şubelere gelen anket cevaplarını görmesini sağlar.
- **İzinler:**
  - `surveys.manage_survey`: Anket oluşturma, düzenleme ve silme yetkisi.
  - `surveys.view_response`: Müşteri yanıtlarını ve NPS analizlerini görüntüleme yetkisi.
  - `surveys.manage_response`: Anket ilgi durumunu (`needs_attention`) güncelleme ve inceleme notu ekleme yetkisi.

## 🔁 Sipariş / POS Çapraz Kanal Koruması

`OrderViewSet` içindeki `customer_display_survey_answered` annotation alanı artık sadece `POS_DISPLAY` session'larını değil, aynı masa için `SMART_TABLE` kaynağından `ANSWERED` durumuna düşen session'ları da sayar. Böylece [[Frontend_Tables]] içindeki POS satış detayı modalı, Smart Table üzerinden cevaplanan siparişlerde survey butonunu yeniden açmaz.

*Bu sayfa INGEST 2026-07-04 Smart Table survey operasyonu ile güncellenmiştir.*
