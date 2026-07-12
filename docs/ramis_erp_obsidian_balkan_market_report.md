# Ramis ERP — Obsidian Wiki Tabanlı Türkiye ve Balkan Pazarı Analizi

> Hazırlanma tarihi: 30 Haziran 2026  
> Kapsam: Türkiye + Balkan hedef pazarları  
> Metodoloji: Bu rapor proje kabiliyetleri için yalnızca `docs/wiki/` içindeki Obsidian dokümanlarına, pazar ve mevzuat değerlendirmesi için güncel internet araştırmasına dayanır.  
> Ürün varsayımı: Ramis ERP bir SaaS değil; yerel ağda çalışan, offline-first bir restoran ERP appliance ürünüdür.

---

## 1. Kısa Sonuç

Ramis ERP, klasik bir restoran POS yazılımından daha geniş bir ürün: POS, KDS, garson mobil, müşteri tableti, depo tableti, stok, reçete, üretim planlama, maliyet, raporlama, yedekleme ve sistem araçlarını aynı appliance etrafında birleştiren yerel-öncelikli bir restoran işletim platformu.

Ürünün en güçlü ticari savı şudur: **internet kesintisi, bulut sağlayıcı problemi veya zayıf bağlantı restoran operasyonunu durdurmamalı**. Bu sav Türkiye için güçlüdür; Balkan pazarları için de özellikle turizm bölgeleri, sahil işletmeleri, küçük zincirler ve çok dilli personel kullanan restoranlarda anlamlıdır.

Ancak satılabilirlik açısından kritik gerçek şudur: Türkiye ve Balkan ülkelerinde restoran POS pazarı artık sadece “sipariş alma” pazarı değildir. Pazarın kapısını açan unsur **mali/fiscal uyum sertifikasyonu**dur. Ramis ERP’nin çekirdek mimarisi güçlü, fakat ülke bazlı e-Adisyon/e-Fatura/fiscalization adaptörleri olmadan Türkiye ve Balkanlarda geniş satış gerçekçi değildir.

Genel değerlendirme:

| Alan | Durum | Yorum |
|------|-------|-------|
| Ürün mimarisi | Güçlü | Django/Next.js/React Native/Electron + PostgreSQL/Redis/Celery yapısı modern ve ölçeklenebilir |
| Offline appliance uyumu | Güçlü | POS offline queue, mobil garson kuyruğu, yerel deploy ve runtime config iyi konumlanmış |
| Restoran operasyon derinliği | Güçlü | Stok, FEFO, depo, üretim planlama, Smart Firing v2, KDS ve reçete/maliyet modülleri ciddi avantaj |
| Türkiye yasal satış hazırlığı | Orta-düşük | Token/Beko mali altyapısı var; e-Adisyon/e-Arşiv entegratör katmanı ticari satış için tamamlanmalı |
| Balkan satış hazırlığı | Düşük-Orta | BG/SQ dil altyapısı avantaj; fakat Serbia ESIR, Croatia Fiskalizacija, Albania DPT/AKSHI, Bulgaria SUPTO/fiscal printer uyumu gerekir |
| Ticari paketlenebilirlik | Orta | Appliance fikri güçlü; MDM, bulut yedekleme, bayi/destek modeli eklenmeli |

---

## 2. Proje Kabiliyetleri: Obsidian Wiki’den Çıkan Resim

### 2.1 Mimari yapı

`[[Mimari_Genel_Bakis]]` ve `[[Tech_Stack]]` dokümanlarına göre Ramis ERP:

- Backend tarafında Django 6, DRF, Channels/Daphne, Celery, PostgreSQL 16 ve Redis 7 kullanıyor.
- Frontend tarafında Next.js 16, React 19, TailwindCSS 4, Zustand, TanStack Query, Axios ve PWA altyapısı var.
- Production dağıtımda systemd, Nginx, Uvicorn/Daphne ayrımı ve Next.js standalone servis modeli bulunuyor.
- Tüm API’ler `/api/v1/` altında toplanıyor; WebSocket ile POS, KDS, masa durumu ve depo bildirimleri gerçek zamanlı aktarılıyor.

Bu mimari, appliance ürünü için doğru bir zemin sağlar. Çünkü buluta bağımlı olmayan, yerel PostgreSQL + Redis + web/mobile istemci kombinasyonu; restoran içi LAN üzerinde düşük gecikmeyle çalışabilir.

### 2.2 Uçtan uca restoran kapsamı

`[[Index]]` içindeki modül haritası ve ilgili sayfalara göre ürün şu ana operasyonları kapsıyor:

| Operasyon alanı | Obsidian kaynakları | Ticari anlamı |
|-----------------|---------------------|---------------|
| POS ve sipariş | `[[Orders]]`, `[[Sales]]`, `[[Frontend_POS]]`, `[[Electron_POS]]` | Restoranın çekirdek satış operasyonu |
| Masa ve şube | `[[Branches]]`, `[[Frontend_Tables]]`, `[[Branch_Scope]]` | Çok bölge/masa düzeni ve şube bazlı veri izolasyonu |
| KDS ve mutfak | `[[Electron_KDS]]`, `[[Frontend_KDS]]`, `[[Smart_Firing_v2]]` | Yoğun servis saatlerinde mutfak akışı |
| Stok ve depo | `[[Inventory]]`, `[[Warehouse]]`, `[[Stock_Return_Cancel]]` | Fire, SKT, minimum stok, satın alma ve mal kabul |
| Reçete ve maliyet | `[[Recipes]]`, `[[Production_Planning]]` | Porsiyon maliyeti, MRP, üretim hedefi |
| Mobil uygulamalar | `[[Mobile_Apps_Family]]`, `[[Mobile_Waiter_App]]`, `[[Smart_Table]]`, `[[Stock_Man_App]]` | Garson, müşteri ve depo için ayrı cihaz deneyimi |
| Raporlama | `[[Reporting]]`, `[[Dashboard]]` | Yönetim raporları, PDF/Excel ve ESC/POS şablonları |
| Mali entegrasyon | `[[Fiscal_Integration]]`, `[[Fiscal_Integration_Production]]` | Yazar kasa/fiscal uyum için sürücü tabanı |
| Sistem araçları | `[[Backup_Restore]]`, `[[Ramis_Monitor]]`, `[[DB_Maintenance]]` | Appliance işletme ve bakım süreçleri |

Bu kapsam, ürünü sadece POS değil, **restoran ERP appliance** olarak konumlandırır.

### 2.3 En güçlü farklılaştırıcılar

#### Gerçek offline operasyon

`[[POS_Offline_Queue]]` dokümanına göre web POS ve web garson ekranları IndexedDB tabanlı kuyrukla; mobil garson uygulaması AsyncStorage kuyruğuyla çalışıyor. Sipariş oluşturma, sipariş tamamlama ve masa tamamlama operasyonları idempotency key ile senkronize ediliyor.

Bu, appliance felsefesi için temel değer önerisidir. Rakiplerin çoğu offline modu pazarlasa bile birçok sistemde offline yalnızca sınırlı satış veya sonradan senkron bekletme düzeyinde kalır. Ramis’in mimarisinde offline davranış ürünün merkezinde tasarlanmış görünüyor.

#### Çok uygulamalı cihaz ailesi

`[[Mobile_Apps_Family]]` sayfasına göre üç React Native uygulama bulunuyor:

- Mobile Waiter: garson sipariş, QR masa açma, garson çağrısı, offline kuyruk.
- Smart Table: müşteri self-servis tablet, menü, sipariş, garson çağırma.
- Stock Man: depo/satın alma tableti, barkod, yazıcı, SQLite offline kuyruk, TR/EN/BG/SQ dil desteği.

BG ve SQ dil desteği özellikle Bulgaristan ve Arnavutluk hedefi için hazır avantajdır. Ancak Sırbistan/Hırvatistan için SR/HR yerelleştirme gerekecektir.

#### Smart Firing v2

`[[Smart_Firing_v2]]` dokümanı, ürünün mutfak operasyonunda sıradan KDS seviyesinin üstüne çıktığını gösteriyor. Sistem:

- istasyon kuyruk derinliğini ölçüyor,
- reçete hazırlık/pişirme sürelerini dikkate alıyor,
- yeterli örnekte öğrenilmiş EMA sürelerini kullanıyor,
- POS’a mutfak yoğunluğu uyarısı dönebiliyor,
- KDS’de force-now ve snooze aksiyonları sunuyor.

Bu özellik premium restoran, steakhouse, otel mutfağı ve yoğun paket servis mutfağı için güçlü bir satış argümanıdır.

#### Stok, FEFO ve üretim planlama

`[[Inventory]]`, `[[Warehouse]]` ve `[[Production_Planning]]` sayfaları, stok tarafının ciddi bir ERP derinliğine sahip olduğunu gösteriyor:

- lot/SKT takibi,
- FEFO maliyet,
- stok rezervasyonu,
- düşük stok ve eksik listesi,
- satın alma önerileri,
- mal kabul ve transfer,
- MRP,
- 86 listesi ve POS engelleme modu,
- üretim planı yaklaşık maliyet raporu.

Bu alan, küçük POS rakiplerine karşı en güçlü farklardan biridir. Restoran sahipleri için asıl karlılık problemi çoğu zaman ödeme ekranı değil; fire, yanlış reçete, stok kaybı, porsiyon maliyeti ve tedarik disiplinidir.

#### Mali entegrasyon için doğru abstraction

`[[Fiscal_Integration]]` dokümanı, mali entegrasyonun Factory/Strategy modeliyle kurulduğunu gösteriyor. Şu sürücü çizgileri var:

- Mock driver,
- Beko/Token X-Connect Cloud,
- Hugin GMP3 gelecek,
- Uyumsoft e-Arşiv gelecek.

Bu yapı, Balkan ülkeleri için de ülke bazlı fiscal adapter mimarisi kurmaya uygundur. Ancak her ülke kendi sertifikasyon/entegratör gerekliliklerini istediği için abstraction tek başına yeterli değildir; yerel sertifikasyon ve partnerlik gerekir.

---

## 3. Pazar Gerçeği: Türkiye

### 3.1 Türkiye’de pazarın ana itici güçleri

Türkiye restoran otomasyon pazarı 2025-2026 döneminde üç baskıyla şekilleniyor:

1. **Yasal uyum baskısı:** GİB e-Adisyon, e-Arşiv/e-Fatura, yeni nesil ÖKC ve VUK 507 güvenli mobil ödeme/e-belge sistemleri pazarın satın alma kararını belirliyor.
2. **Maliyet baskısı:** Restoranlar artan gıda, personel ve kira maliyetleri nedeniyle stok, fire, reçete maliyeti ve hızlı servis yönetimine daha fazla önem veriyor.
3. **Operasyonel hız:** Garson mobil, KDS, QR/self-servis, paket servis entegrasyonu ve masada ödeme standart beklenti haline geliyor.

Güncel kaynaklarda NarPOS’un 2025 ilk çeyrekte %240 büyüme açıkladığı, 10 ülkede 14 binden fazla işletmeye hizmet verdiği belirtiliyor. Bu veri pazarın canlı olduğunu, fakat rekabetin agresif ve fiyat duyarlı olduğunu gösteriyor.

### 3.2 Türkiye’de rakip yapısı

| Rakip grubu | Örnekler | Güçlü yanları | Ramis açısından risk |
|-------------|----------|---------------|----------------------|
| Bulut POS / modern SaaS | Simpra, NarPOS, Adisyo, Dion, ikas/benzeri çözümler | e-Adisyon, ödeme, paket servis, hızlı satış ekibi | Ramis’in mali uyum ve pazarlama tarafında geç kalması |
| Geleneksel yerel POS | SambaPOS, Akınsoft, Logo/Mikro çevresi | Yerel çalışmaya alışkın müşteri, bayi ağı | Ramis’in bayi ve destek ağı olmaması |
| Yazar kasa/ödeme odaklı çözümler | Beko/Token, Pavo, Ingenico ekosistemleri | Mali cihaz ve ödeme tarafında güçlü | POS yazılımı ile ödeme entegrasyonunun paketlenmesi |

Türkiye’de Ramis’in en net konumu:

> **“SaaS abonelik istemeyen, internet kesintisinden korkan, ama eski Windows POS arayüzü de kullanmak istemeyen restoranlar için modern offline ERP appliance.”**

### 3.3 Türkiye için gerçekçi satılabilirlik

Ramis Türkiye’de teknik olarak güçlü, fakat ticari olarak iki eşiği geçmeden geniş satılamaz:

1. **e-Adisyon/e-Arşiv entegratör bağlantısı**
2. **Üretim ortamında onaylanmış mali cihaz entegrasyonu**

Beko/Token X-Connect Cloud altyapısı önemli bir başlangıçtır. Fakat satış dili açısından “mali entegrasyon mimarimiz var” yeterli değildir; müşterinin duyacağı cümle şu olmalıdır:

> “Bu sistem GİB/e-Adisyon/e-Arşiv süreçlerinizde bugün kullanılabilir; entegratör, yazar kasa ve muhasebe akışınız kurulmuş şekilde teslim edilir.”

Bu noktaya gelmeden ürün Türkiye’de daha çok pilot/proje bazlı satılabilir.

---

## 4. Balkan Pazarı: Neden Mantıklı?

Balkanlar Ramis için teorik olarak uygun bir ikinci pazar çünkü:

- turizm ve hospitality büyüyor,
- birçok ülkede internet altyapısı turistik bölgelerde her zaman stabil değil,
- restoranlar mali/fiscal sistemlere uyum sağlamak zorunda,
- yerel POS çözümleri çoğunlukla ülke odaklı ve parçalı,
- küçük/orta işletmeler SaaS abonelik maliyetine duyarlı,
- çok dilli personel ve sezonluk ekip yönetimi yaygın.

Araştırmada öne çıkan veriler:

| Ülke | Güncel pazar sinyali |
|------|----------------------|
| Hırvatistan | 2024’te 21,3 milyon turist, 108,7 milyon geceleme; turizm güçlü ve yıl geneline yayılmaya çalışıyor |
| Arnavutluk | 2024’te 11,7 milyon yabancı ziyaretçi; %15,2 artış; turizm geliri ilk 9 ayda yaklaşık 3,8 milyar euro olarak raporlanıyor |
| Sırbistan | 2024’te catering sektörü reel %8,3 büyüme; konaklama ve yiyecek hizmetlerinde güçlü ivme |
| Bulgaristan | Konaklama hizmet gelirinin 2028’e kadar yaklaşık 1,6 milyar euroya ulaşacağı öngörülüyor |

Bu veriler Ramis için pazarın var olduğunu gösterir. Fakat Balkan pazarı tek bir pazar değildir; her ülke kendi fiscalization mimarisi, dili, para birimi, sertifikasyon süreci ve yerel rakipleriyle ayrı ele alınmalıdır.

---

## 5. Ülke Bazlı Balkan Değerlendirmesi

### 5.1 Sırbistan

Sırbistan’da e-fiscalization sistemi 2022’den beri yazılım + donanım kombinasyonuna dayanıyor. POS uygulamaları ESIR olarak sertifikalanmalı; LPFR veya VPFR ile çalışmalı; satış verisi vergi idaresine gerçek zamanlı veya kontrollü offline senaryolarla iletilmeli.

Yerel rakipler ve sinyaller:

- BKC SOFT: akredite ESIR, restoran/kafe/hotel vurgusu.
- Europos ESIR / GURMAN: restoran çözümü, ESIR/LPFR cihazları, 6.000+ cihaz ifadesi.
- UniSoft: kafe/restoran için ESIR POS, internet yokken çalışma ve sonradan senkron vurgusu.

Ramis için yorum:

| Başlık | Değerlendirme |
|--------|---------------|
| Pazar uyumu | Yüksek |
| Offline appliance uyumu | Yüksek; LPFR/local processor mantığı appliance fikrine yakın |
| Giriş zorluğu | Yüksek; ESIR sertifikasyonu ve yerel partner şart |
| Dil ihtiyacı | Sırpça (Latin/Kiril tercihi değerlendirilmeli) |
| Öncelik | Balkanlar içinde yüksek öncelikli pilot adayı |

Sırbistan için strateji: Ramis doğrudan tek başına pazara girmek yerine, akredite ESIR sağlayıcı veya fiscal integrator ile “Ramis operational ERP + yerel ESIR fiscal layer” modeli kurmalıdır.

### 5.2 Hırvatistan

Hırvatistan turizm ölçeği açısından Balkanların en cazip ülkelerinden biridir. 2024’te 21,3 milyon turist ve 108,7 milyon geceleme önemli bir hospitality pazarı yaratır.

Ancak 2026 itibarıyla Fiskalizacija 2.0 ve e-invoicing rejimi çok ciddidir:

- B2C işlemler için fiscalization,
- JIR, ZKI, QR code,
- SOAP/HTTPS ve sertifika tabanlı imzalama,
- B2B/B2G e-invoice gereksinimleri.

Yerel rekabet:

- Storyous,
- Profis,
- Pantheon Cafe,
- POS Sector,
- global çözümler: Lightspeed/Toast/Square benzeri ürünler belirli segmentlerde.

Ramis için yorum:

| Başlık | Değerlendirme |
|--------|---------------|
| Pazar uyumu | Orta-Yüksek |
| Harcama kapasitesi | Yüksek; premium restoran/otel segmenti güçlü |
| Giriş zorluğu | Çok yüksek; fiscalization + e-invoice uyumu karmaşık |
| Rekabet | Yüksek ve yerel uyumlu |
| Öncelik | İlk pazar değil; ikinci faz premium/otel pilotu |

Hırvatistan’da Ramis’in doğrudan POS olarak girmesi zordur. Daha gerçekçi giriş: otel/restoran mutfak + stok + üretim + appliance operasyon katmanı olarak, yerel fiscal POS ile entegre çalışan bir model.

### 5.3 Arnavutluk

Arnavutluk 2024 turizm büyümesiyle dikkat çekiyor: 11,7 milyon yabancı ziyaretçi ve %15,2 artış raporlanıyor. Turistik bölgelerde yeni restoran, beach club, otel ve kafe yatırımları Ramis için fırsat yaratabilir.

Fiscalization tarafında:

- DPT ve AKSHI sertifikalı yazılım kullanımı gerekiyor.
- AKSHI dijital sertifikası ile işlem imzalama var.
- İşlemler merkezi platforma gerçek zamanlı raporlanıyor.

Yerel rakipler:

- easyPos,
- logibar,
- fature.al,
- BarExpres / SoftExpres çözümleri.

Ramis için yorum:

| Başlık | Değerlendirme |
|--------|---------------|
| Pazar uyumu | Yüksek |
| Turizm büyümesi | Çok yüksek |
| Dil hazırlığı | İyi; Stock Man ve garson uygulamalarında SQ desteği mevcut |
| Giriş zorluğu | Orta-Yüksek; DPT/AKSHI sertifikasyon gerekir |
| Öncelik | Sırbistan ile birlikte en mantıklı Balkan pilot adaylarından biri |

Arnavutluk için özel avantaj: Ramis’in mevcut SQ dil altyapısı. Bu, ürünün yerelleştirme maliyetini düşürür. Ancak tüm frontend, POS, raporlar, fişler ve eğitim materyali Arnavutça olarak tamamlanmalıdır.

### 5.4 Bulgaristan

Bulgaristan’da fiscal printer ve NRA bağlantılı sistemler önemlidir. Ordinance N-18 ve SUPTO kavramı, satış yönetim yazılımlarını regüle eder. 2026 bütçe düzenlemelerinde SUPTO sertifikalı POS yazılımının zorunlu hale gelmesi yönünde sinyaller vardır.

Ramis için yorum:

| Başlık | Değerlendirme |
|--------|---------------|
| Pazar uyumu | Orta-Yüksek |
| Dil hazırlığı | İyi; BG mobil dil desteği mevcut |
| Giriş zorluğu | Yüksek; SUPTO/NRA ve fiscal printer uyumu gerekir |
| Appliance uyumu | İyi; fiscal printer bağlantısı yerel cihaz fikrine uyar |
| Öncelik | Arnavutluk/Sırbistan sonrası, yerel partner bulunursa yüksek |

Bulgaristan’da teknik olarak Ramis’in appliance yapısı doğru olabilir; fakat NRA/SUPTO onayı ve fiscal printer entegrasyonları tamamlanmadan ürün satılamaz.

### 5.5 Bosna-Hersek, Kuzey Makedonya, Karadağ

Bu ülkeler de restoran ve turizm açısından fırsat taşır; fakat ilk dalga için daha sınırlı önerilir. Sebepler:

- pazar daha küçük,
- mevzuat ülke içinde bölgesel farklılaşabilir,
- yerel partner ihtiyacı daha belirgindir,
- kaynakları bölmek erken aşamada risklidir.

Öneri: İlk Balkan dalgası Sırbistan + Arnavutluk + Bulgaristan olarak planlanmalı; Hırvatistan premium ikinci faz olmalı; Bosna/Karadağ/Kuzey Makedonya yerel partner geldikçe değerlendirilmelidir.

---

## 6. Ramis’in Rakiplere Göre Konumu

### 6.1 Rakiplere göre güçlü olduğu alanlar

| Alan | Ramis avantajı |
|------|----------------|
| Offline-first mimari | Web POS, mobil garson ve Stock Man tarafında kuyruk yapısı var |
| Appliance kurulumu | systemd, Nginx, Uvicorn/Daphne, runtime config, install/update betikleri hazır |
| Mutfak operasyonu | Smart Firing v2 sıradan KDS ürünlerinden daha ileri |
| Stok ve maliyet | FEFO, lot, MRP, üretim planı, satın alma önerisi güçlü |
| Çok uygulamalı ekosistem | POS, KDS, garson, müşteri tableti, depo tableti |
| Çok dil temeli | TR/EN/BG/SQ bazı mobil uygulamalarda hazır |
| Veri egemenliği | Veri müşterinin appliance cihazında kalır |

### 6.2 Rakiplerin güçlü olduğu alanlar

| Alan | Rakip avantajı |
|------|----------------|
| Fiscal sertifikasyon | Yerel oyuncular ülke mevzuatına zaten uyumlu |
| Pazarlama ve bayi ağı | Türkiye ve Balkanlarda yerel satış ağı kritik |
| Paket servis entegrasyonu | Wolt/Glovo/Yemeksepeti/Getir/Trendyol bağlantıları çoğu rakipte daha hazır |
| Ödeme entegrasyonu | SoftPOS, banka POS, yazar kasa ve e-belge paketleri olgun |
| Düşük giriş maliyeti | SaaS rakipleri abonelikle hızlı başlar |

### 6.3 Ramis’in doğru rekabet cümlesi

Ramis, “en ucuz POS” olarak konumlanmamalı. Bu savaş NarPOS, yerel ESIR çözümleri ve basit fiscal POS sağlayıcılarıyla kaybedilir.

Doğru konum:

> **Premium offline restaurant operations appliance: yüksek yoğunluklu restoranlarda satış, mutfak, stok ve maliyeti internet bağımlılığı olmadan yöneten yerel ERP kutusu.**

---

## 7. Gerçekten Eklenmesi Gereken Feature’lar

### P0 — Ticari satış için zorunlu

#### 1. Ülke bazlı fiscal connector katmanı

Mevcut `[[Fiscal_Integration]]` mimarisi Türkiye için başlamış durumda; fakat çok ülke hedefi için genişletilmeli.

Önerilen yapı:

```text
FiscalDriverFactory
├── Turkey
│   ├── Token/Beko X-Connect
│   ├── Uyumsoft/QNB/Park e-Adisyon + e-Arşiv
│   └── GMP-3 local TCP/IP
├── Serbia
│   ├── ESIR connector
│   └── LPFR/VPFR adapter
├── Albania
│   ├── DPT/AKSHI certified fiscalization adapter
│   └── NIVF/e-invoice flow
├── Bulgaria
│   ├── NRA/SUPTO adapter
│   └── fiscal printer protocol
└── Croatia
    ├── Fiskalizacija SOAP/HTTPS
    ├── JIR/ZKI/QR
    └── eRačun/UBL integration
```

Bu özellik olmadan Balkan pazarına satış stratejisi gerçekçi değildir.

#### 2. e-Adisyon/e-Arşiv/e-Fatura Türkiye paketi

Türkiye pazarında ilk gelir için en kritik iş budur. Ürün güçlü olsa bile mali uyum tamamlanmadan restoran sahibi risk almaz.

Gerekenler:

- GİB lisanslı özel entegratör seçimi,
- e-Adisyon lifecycle,
- e-Arşiv/e-Fatura kesimi,
- offline kuyruk ve bağlantı sonrası gönderim,
- mali hata durumlarında POS UX,
- muhasebe aktarımı.

#### 3. Appliance yedekleme ve disaster recovery

`[[Backup_Restore]]` yerel backup/restore için iyi temel sunuyor. Ticari appliance için bu şuna dönüşmeli:

- şifreli bulut yedek,
- NAS/local disk hedefi,
- yedek bütünlük testi,
- yeni cihaza hızlı restore,
- müşteri panelinde “son yedek başarılı” kanıtı.

Appliance satışında en sık gelecek itiraz “cihaz bozulursa verim gider mi?” olacaktır.

### P1 — Rekabette öne çıkaran özellikler

#### 4. Balkan localization framework

Sadece UI çevirisi yetmez. Her ülke için:

- dil,
- para birimi,
- KDV oranları,
- fiş formatı,
- tarih/saat formatı,
- vergi numarası alanları,
- fiscal receipt zorunlu alanları,
- ödeme türleri,
- rapor çıktıları,
- destek dokümanları

ülke profili olarak yönetilmeli.

İlk dil önceliği:

1. Türkçe
2. İngilizce
3. Bulgarca
4. Arnavutça
5. Sırpça
6. Hırvatça

#### 5. Marketplace ve teslimat entegrasyonları

Türkiye: Yemeksepeti, Getir Yemek, Trendyol Yemek.  
Balkanlar: Wolt, Glovo, Bolt Food ve ülke bazlı yerel platformlar.

Ramis’in offline felsefesi burada şöyle korunmalı:

- dış platform siparişleri internet varken alınır,
- iç operasyon LAN üzerinde devam eder,
- KDS ve mutfak yazıcıları yerel çalışır,
- platform durum güncellemeleri bağlantı varsa gönderilir,
- bağlantı yoksa sadece dış kanal senkronu bekler.

#### 6. Merkez portal ama operasyonel bağımsız şube

Çok şubeli restoranlar için her appliance kendi başına çalışmalı; merkez portal sadece raporlama, sağlık durumu, lisans ve yedek izleme yapmalı.

Merkez portalın ilk kapsamı:

- şube ciro özeti,
- ürün satış karşılaştırması,
- stok kritik listeleri,
- yedekleme durumu,
- cihaz sağlık durumu,
- lisans ve sürüm takibi.

Bu yapı SaaS’a dönüşmek değildir; appliance’ların salt-okunur konsolidasyon katmanıdır.

#### 7. MDM / OTA güncelleme

`[[Deployment]]` ve `update.sh` iyi bir temel sunuyor; fakat ticari ürün için yüzlerce müşteride elle SSH/güncelleme yönetilemez.

Gerekenler:

- appliance heartbeat,
- servis sağlık izleme,
- disk/RAM/CPU/sıcaklık metrikleri,
- güvenli güncelleme kanalı,
- rollback,
- bayi/destek paneli.

### P2 — Premium farklılaşma

#### 8. Predictive inventory ve satın alma otomasyonu

`[[Warehouse]]` içinde tüketim trendi + minimum stok temelli satın alma önerisi zaten var. Bu özellik daha ileri taşınabilir:

- satış trendi,
- gün/hafta/sezon etkisi,
- hava durumu,
- turistik sezon,
- özel günler,
- geçmiş fire oranı,
- tedarikçi teslim süresi

ile yerel çalışan tahmin modeli.

Bu, özellikle turistik Balkan bölgelerinde sezon dalgalanması yaşayan işletmeler için güçlü değer üretir.

#### 9. QR menü + kendi online sipariş kanalı

Smart Table fiziksel tablet gerektirir. Buna ek olarak müşterinin kendi telefonundan QR ile sipariş vereceği LAN-first web menüsü eklenmeli.

İkinci aşamada restoranın kendi paket servis sayfası:

- Wolt/Glovo komisyonlarını azaltma,
- kendi müşteri verisini toplama,
- sadakat sistemiyle bağlama

avantajı sağlar.

#### 10. Sadakat, CRM ve kampanya motoru

Restoran POS pazarında CRM artık opsiyonel değil. Müşteri modülü şu alanlara genişletilmeli:

- puan/ödül,
- doğum günü kampanyası,
- segment bazlı indirim,
- ziyaret sıklığı,
- harcama segmenti,
- KVKK/GDPR uyumlu izin kayıtları,
- SMS/e-posta/WhatsApp gönderim kuyruğu.

---

## 8. Önerilen Pazar Giriş Sırası

### Faz 1 — Türkiye ticari hazırlık

Süre: 3-4 ay

Hedef:

- e-Adisyon/e-Arşiv entegrasyonu,
- Token/Beko üretim doğrulaması,
- otomatik bulut yedekleme,
- 2-3 pilot restoran,
- kurulum/eğitim dokümantasyonu.

Türkiye ilk pazar olmalı çünkü ürünün dili, iş akışı ve mevcut fiscal dokümanları Türkiye merkezli.

### Faz 2 — Arnavutluk ve Sırbistan pilotu

Süre: 4-8 ay

Neden bu iki ülke:

- Arnavutluk: hızlı turizm büyümesi, SQ dil temeli, yeni işletme yatırımları.
- Sırbistan: ESIR/LPFR mimarisi appliance fikrine yakın, offline ihtiyacı yerel rakipler tarafından bile vurgulanıyor.

Giriş modeli:

- doğrudan satış değil,
- yerel fiscal partner,
- pilot kurulum,
- fiscal layer partnerden, operasyon layer Ramis’ten.

### Faz 3 — Bulgaristan

Süre: 8-12 ay

BG dil altyapısı avantajdır. Ancak SUPTO/NRA/fiscal printer sertifikasyon süreçleri netleştirilmeden satışa çıkılmamalı.

### Faz 4 — Hırvatistan

Süre: 12+ ay

Hırvatistan yüksek gelirli ama mevzuat ve rekabet daha zor. İlk hedef bağımsız küçük restoran değil; premium otel/restoran veya çok şubeli işletmeler olmalı.

---

## 9. Ticari Paketleme Önerisi

### 9.1 Appliance paketleri

| Paket | Hedef müşteri | İçerik |
|-------|---------------|--------|
| Ramis Box Core | Kafe / küçük restoran | POS, masa, KDS, temel rapor, mali entegrasyon |
| Ramis Box Pro | Orta restoran | Core + garson mobil + rezervasyon + gelişmiş rapor |
| Ramis Box Kitchen | Yoğun mutfak | Pro + Smart Firing v2 + prep display + mutfak istasyonları |
| Ramis Box Inventory | Stok hassas işletme | Pro + Stock Man + FEFO + satın alma + üretim planlama |
| Ramis Box Multi-Branch | 2+ şube | Enterprise + merkez portal + MDM + yedekleme |

### 9.2 Gelir modeli

Ramis SaaS olarak satılmamalı; fakat sürdürülebilir gelir için bakım katmanı şarttır.

Önerilen model:

- tek seferlik appliance + yazılım lisansı,
- yıllık mevzuat/güncelleme/destek paketi,
- ülke fiscal adapter lisansı,
- kurulum ve eğitim bedeli,
- isteğe bağlı MDM/yedekleme aboneliği.

Burada “abonelik yok” mesajı dikkatli kullanılmalı. Daha doğru ifade:

> Ana operasyon aboneliğe bağlı değildir; yıllık bakım ve mevzuat güncellemesi opsiyonel değil, ticari güvence paketidir.

---

## 10. Satılabilirlik Puanı

| Pazar | Bugünkü satılabilirlik | 6 ay sonrası potansiyel | Ana koşul |
|-------|------------------------|-------------------------|-----------|
| Türkiye | 5/10 | 8/10 | e-Adisyon/e-Arşiv + pilot referans |
| Arnavutluk | 3/10 | 7/10 | DPT/AKSHI partner + SQ tam yerelleştirme |
| Sırbistan | 3/10 | 7/10 | ESIR/LPFR partner + SR dil |
| Bulgaristan | 4/10 | 7/10 | SUPTO/NRA/fiscal printer uyumu + BG tam yerelleştirme |
| Hırvatistan | 2/10 | 6/10 | Fiskalizacija 2.0 partner + HR dil + premium pilot |
| Bosna/Karadağ/K. Makedonya | 2/10 | 5/10 | Yerel partner ve ülke bazlı fiscal analiz |

---

## 11. Ana Riskler

| Risk | Neden önemli | Azaltma |
|------|--------------|---------|
| Fiscal sertifikasyon gecikmesi | Satışı doğrudan engeller | Ülke bazlı local partner ve adapter roadmap |
| Appliance veri kaybı algısı | Müşteri güvenini kırar | Şifreli yedek + hızlı restore demo |
| Rakiplerin ucuz SaaS baskısı | Fiyat karşılaştırması zorlaşır | TCO, offline güven ve stok/maliyet tasarrufu vurgusu |
| Yerelleştirme eksikliği | Balkanlarda ürün yabancı kalır | Dil + para birimi + fiş + vergi profili |
| Bayi/destek ağı yokluğu | Saha operasyonu ölçeklenmez | Sertifikalı kurulum partner programı |
| Marketplace entegrasyon eksikliği | Paket servis restoranları kaybedilir | Wolt/Glovo/Yemeksepeti/Getir/Trendyol roadmap |

---

## 12. Son Hüküm

Ramis ERP’nin pazardaki en doğru tanımı şudur:

> **Offline-first, fiscal-ready hale getirildiğinde Türkiye ve Balkanlardaki yüksek yoğunluklu restoranlar için güçlü bir restoran ERP appliance adayı.**

Ürün mimarisi, klasik POS yazılımlarından daha derin; özellikle mutfak, stok, depo, üretim ve offline operasyon tarafında ciddi bir omurga var. Ancak Türkiye ve Balkan pazarlarında yazılım kalitesi tek başına satış getirmez. Bu coğrafyada satın alma kararını belirleyen ilk soru şudur:

> “Bu sistem ülkemde yasal olarak fiş/fatura kesebiliyor mu?”

Bu soruya ülke bazında “evet” denebildiği anda Ramis’in satış hikayesi güçlü hale gelir. O noktadan sonra Ramis’in offline appliance yaklaşımı, SaaS yorgunluğu yaşayan ve internet kesintisine tahammülü olmayan restoranlar için gerçek bir farklılaşma yaratır.

En gerçekçi strateji:

1. Türkiye’de mali uyumu tamamla ve pilot referans çıkar.
2. Arnavutluk ve Sırbistan’da yerel fiscal partnerlerle pilot başlat.
3. Bulgaristan için BG dil avantajını SUPTO/fiscal printer uyumuna bağla.
4. Hırvatistan’a ancak premium/pilot ve yerel partnerle gir.
5. Marketplace, MDM, bulut yedek ve merkez portal ile appliance ürününü ticari olarak ölçeklenebilir hale getir.

---

## Kaynak Notları

Proje kabiliyetleri için okunan Obsidian kaynakları:

- `docs/wiki/Index.md`
- `docs/wiki/Mimari_Genel_Bakis.md`
- `docs/wiki/Tech_Stack.md`
- `docs/wiki/POS_Offline_Queue.md`
- `docs/wiki/Mobile_Apps_Family.md`
- `docs/wiki/Fiscal_Integration.md`
- `docs/wiki/Production_Planning.md`
- `docs/wiki/Inventory.md`
- `docs/wiki/Warehouse.md`
- `docs/wiki/Smart_Firing_v2.md`
- `docs/wiki/Deployment.md`
- `docs/wiki/Backup_Restore.md`
- `docs/wiki/Reporting.md`

İnternet araştırmasında kullanılan başlıca kaynak türleri:

- Türkiye restoran POS/e-Adisyon haber ve ürün kaynakları: TurizmVizyon, Dion POS, Simpra, Horeca Trend.
- Balkan fiscalization kaynakları: Serbia fiscalization/ESIR kaynakları, Croatia Fiskalizacija 2.0 duyuruları, Albania DPT/AKSHI fiscalization kaynakları, Bulgaria Ordinance N-18/SUPTO/NRA kaynakları.
- Balkan turizm/hospitality verileri: Hırvatistan 2024 turizm sonuçları, Arnavutluk 2024 ziyaretçi verileri, Sırbistan İstatistik Ofisi 2024 hospitality büyümesi, Bulgaristan accommodation outlook kaynakları.
