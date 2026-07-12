# Ramis ERP için Eklenebilecek Özellikler

## Genel Değerlendirme
Ramis ERP, çekirdek restoran operasyonu açısından birçok rakibinden daha derin bir altyapıya sahip. Özellikle `Smart_Firing_v2`, `Inventory`, `Warehouse`, `Recipes`, `Production_Planning`, `POS_Offline_Queue`, mobil garson/depo uygulamaları, RBAC, yedekleme ve yük testi tarafları güçlü bir temel oluşturuyor.

Buna karşılık ürünün mevcut zayıf noktası, işletme sahibine doğrudan gelir artıran ve karar aldıran katmanların henüz yeterince ürünleşmemiş olması. Bu nedenle sistem, **kontrollü pilot ve erken müşteri kullanımı için hazır**, ancak **geniş pazara ölçekli çıkış için birkaç kritik ürünleştirme adımı** gerektiriyor.

> Not: Fiscal ve Yemeksepeti/Getir tipi paket servis entegrasyonları bu değerlendirmede bilinçli olarak kapsam dışı tutulmuştur.

## Ana Farklılaşma Alanı
Ramis’in asıl farkı sadece sipariş almak değil, restoran sahibine şu soruların cevabını verebilmek olmalı:

- Bugün hangi üründen gerçekten para kazandım?
- Hangi ürün stok, fire veya kaçak nedeniyle zarar ettiriyor?
- Yarın ne kadar hazırlık yapmalıyım?
- Hangi şubede personel, stok, hız veya ürün performansı sapıyor?
- Müşteri neden geri gelmiyor?

Mevcut yapı bu hedef için güçlü bir temel sunuyor. Satış, reçete, FEFO maliyet, SKT, üretim planlama, garson performansı, müşteri geçmişi ve dashboard verileri zaten mevcut. Asıl fırsat, bunları birer kayıt ekranı olmaktan çıkarıp **karar desteği üreten bir yönetim katmanına** dönüştürmek.

## Öncelikli Eklenebilecek Özellikler
### 1. Kâr ve Menü Mühendisliği Paneli (Yapıldı)
En güçlü fırsat bu alanda görünüyor. FEFO tabanlı gerçek porsiyon maliyeti ile satış verisi aynı sistemde bulunduğu için, klasik menü mühendisliği matrisi kurulabilir. Ürünler satış adedi değil; brüt kâr, reçete maliyeti, fire etkisi, indirim oranı ve hazırlık süresine göre sınıflandırılabilir.

Bu ekranın şu çıktıları vermesi yüksek değer üretir:

- ürün bazlı gerçek kâr marjı ( ## Eklendi )
- teorik ve gerçek tüketim farkı ( ## Eklendi )
- fire ve kaçak tespiti ( ##Eklendi )
- "fiyat artır", "öne çıkar", "menüden çıkar", "maliyeti arttı" gibi aksiyon önerileri ( ## Eklendi )

Bu alan, "sistem stok tasarrufuyla kendini amorti eder" söylemini en somut hale getiren katmandır.

### 2. Sadakat, CRM ve Geri Kazanım
`Customers` modülü şu anda daha çok kayıt ve satış geçmişi seviyesinde görünüyor. Sadakat ve müşteri geri kazanımı tarafı eklenirse ticari değer ciddi şekilde artar.

İlk aşamada yeterli olacak bileşenler:

- puan veya ödül sistemi
- ziyaret sıklığına göre segmentleme
- doğum günü kampanyaları
- son 30 gündür gelmeyen müşteri listesi
- kampanya kuponu ve tekrar ziyaret raporu
- KVKK izin kaydı

Offline-first mimariye uygun bir sadakat yapısı, "müşteri verisi üçüncü tarafa gitmiyor" mesajıyla ayrıca konumlanabilir.

### 3. QR ile Telefonda Menü ve Sipariş
`Smart_Table` yaklaşımı değerli olsa da her masaya tablet koymak ölçeklenebilir olmayabilir. Daha düşük maliyetli ve yaygın çözüm, müşterinin kendi telefonu üzerinden QR ile menüye erişmesi, garson çağırması ve sipariş vermesidir.

> Bu kısım zaten var ancak sistem dışa kapalı. Smart table üzerinden bu işlem yapılıyor. 

Mevcut `Smart_Table`, `Orders`, `Menu` ve `Waiter_Call` altyapısı bu özelliğe yakın duruyor. Opsiyonel ödeme talebi de sonradan eklenebilir.

### 4. Misafir Geri Bildirim ve Şikayet Takibi
Fişe veya QR menüye bağlı kısa geri bildirim akışları oldukça değerli olur. Yemek, servis, hız, temizlik ve NPS gibi veriler toplanıp masa, garson, ürün ve şube bazında ilişkilendirilebilir.

Bu yapı `Performances` ve `Customers` ile birleştiğinde, işletmeciye sadece memnuniyet skoru değil, doğrudan aksiyon üreten bir kalite görünürlüğü sağlar.

> Bunun için bir anket sistemi geliştirildi. bu sistem smart_table ve POS üzerinde Müşteri ekranı ile veriler toplanabiliyor. 
> Ancak biraz daha geliştirilmeli.


### 5. Operasyon Checklist ve Standart İş Akışları  ( YAPILACAK )
Özellikle zincirleşen veya büyüyen restoranlar için en kritik ihtiyaçlardan biri standart operasyon takibidir. POS dışındaki günlük akışların da sistem içinde görünür hale gelmesi gerekir.

Örnek alanlar:

- açılış ve kapanış kontrol listeleri
- temizlik kontrolü
- soğuk oda sıcaklık kayıtları
- günlük kasa, depo ve mutfak görevleri

Bu alan `Prep`, `Kitchen_Closing` ve `Shifts` ile doğal biçimde birleşir.

### 6. Akıllı Satın Alma ve Tedarikçi Önerileri  ( YAPILDI )
Depo ve tedarik altyapısı güçlü olduğu için bu katman gerçek ERP değerini yükseltir. Sadece mevcut stoku göstermek yerine satın alma kararı üreten ekranlar daha etkili olur.

Öne çıkan fırsatlar:

- önümüzdeki birkaç gün için satın alma önerisi ( # Yapılabilir.)
- geç teslim eden tedarikçi uyarıları ( ### bunu hatırlatıcı bir tasarım yapılabilir.)
- fiyatı artan ürünlerin takibi ( ### Satın alınan ürünlerin fiyatlarının artışı için bir tab daha açılabilir.)
- alternatif tedarikçi önerileri ( ### Gereksiz özellik. )

### 7. Personel Planlama, Bahşiş ve Prim Takibi ( # Yapılabilir.)
`Shifts` modülü kasa vardiyası seviyesinde kalıyorsa, personel planlama tarafı halen açık demektir. Restoranların en büyük maliyet kalemlerinden biri personel olduğu için bu alan yüksek önceliklidir.

İlk aşamada yeterli olacak kapsam:

- giriş ve çıkış takibi > Bunun için RFID donanım geliştirilip sisteme bilgi gönderilebilir. 
- haftalık vardiya planlama ### YAPILABİLİR
- izin ve yoğun saat bazlı planlama ### YAPILABİLİR
- bahşiş havuzu ve dağıtımı 
- garson prim veya performans raporu ### Çıkartılabilir

`Performances` tarafındaki mevcut analitikler bu yapıya temel olabilir.

### 8. Patron Mobil Özeti
Restoran sahibinin en sık sorduğu soru genellikle "Bugün ne yaptık?" olur. Bu nedenle mevcut dashboard verisinin daha sade bir mobil özeti yüksek etki yaratır.

Push veya e-posta ile şu özetler gönderilebilir:

- günlük ciro
- iptal oranı
- fire özeti
- şube bazlı hızlı durum göstergeleri

Geliştirme maliyeti görece düşük, demo ve satış etkisi ise yüksektir.

### 9. Kurulum ve Veri Taşıma Sihirbazı ( # Yapılabilir.)
Piyasaya çıkış açısından bu madde, bazı feature'lardan daha kritiktir. Restoranların en büyük sürtünme noktası sistemi satın aldıktan sonra kurulum ve veri taşıma sürecidir.

Gerekli temel bileşenler:

- Excel'den menü, stok, reçete, masa ve kullanıcı içe aktarma ## Import Export yapılabilir.
- demo veri yükleme > Zaten var.
- ilk kurulum kontrol listesi 
- hazır rol şablonları > Zaten var.

Bu alan güçlenmeden geniş ölçekli satışta sürtünme yüksek kalır.

### 10. Otel PMS Entegrasyonu
Eğer Balkan stratejisinde otel segmenti gerçekten hedefleniyorsa, PMS entegrasyonu önemli bir kapı açıcı olabilir. Özellikle "oda hesabına yazma" desteği, otel restoranlarında satın alma kararını etkileyen kritik bir farktır.

Bu özellik genel restoran pazarından çok, hedef segment odaklı stratejik bir özelliktir.

## Piyasaya Hazırlık Durumu
Mevcut durumda en gerçekçi değerlendirme şu:

- kontrollü pilot ve erken müşteri için uygun
- geniş pazara çıkış için henüz bazı ürünleştirme eksikleri var

Teknik tarafta olumlu sinyaller güçlü: `Deployment`, `Backup_Restore`, `RBAC`, `Branch_Scope`, `POS_Offline_Queue`, `Load_Testing` ve çoklu mobil/desktop uygulama ailesi, ürünün sahaya çıkma niyetinin ciddi olduğunu gösteriyor.

## Geniş Lansman Öncesi Netleşmesi Gereken Alanlar
- Gerçek restoranda en az 2-4 haftalık pilot: POS, KDS, yazıcılar, mobil garson, depo ve offline senaryolar birlikte test edilmeli.
- Kurulum ve migrasyon kolaylığı: Excel içe aktarma, ilk kurulum sihirbazı ve rol şablonları tamamlanmalı.
- Desteklenebilirlik: log/diagnostic paketi, yedek geri yükleme provası ve cihaz bağlantı sorunları için görünür araçlar hazırlanmalı.
- Ürün paketleri netleşmeli: küçük kafe, masa servis restoran, zincir şube gibi segmentlerde hangi modüllerin sunulacağı açık olmalı.
- Eğitim ve dokümantasyon hazırlanmalı: kasiyer, garson, müdür ve depo sorumlusu için kısa operasyon akışları tanımlanmalı.

## Sonuç
Ürün bugün bile güçlü bir temel sunuyor. Ancak piyasada gerçekten fark yaratması için odağın "daha fazla modül" değil, **kârlılık, sadakat, kolay kurulum ve işletme karar desteği** tarafında olması daha doğru görünüyor.

İlk ticari çıkış için en mantıklı paket şu omurgada şekillenebilir:

- POS
- KDS
- offline çalışma
- stok ve reçete yönetimi
- üretim ve fire takibi
- temel CRM
- kolay kurulum ve veri taşıma
