# Audit Trail (Denetim İzleri)

Audit Trail sistemi, uygulama genelinde gerçekleştirilen kritik operasyonların (iptal, indirim, stok hareketi vb.) kim tarafından, ne zaman ve hangi cihazdan yapıldığını "değiştirilemez" (append-only) bir şekilde kayıt altına alır.

## Mimari Genel Bakış

Sistem üç ana katmandan oluşur:

1.  **Backend (Django App - `apps.audit`):** Merkezi kayıt motoru.
2.  **Middleware (`AuditMiddleware`):** Her HTTP isteğinde kullanıcı, IP ve User-Agent bilgisini yakalayarak thread-local context'e alır. **2026-06-27 itibariyle yalnızca `/api/` ile başlayan isteklerde çalışır** — admin paneli, static dosyalar ve health-check endpoint'leri artık audit bağlamına dahil edilmez. Bu sayede non-API isteklerde gereksiz thread-local işlemler önlenmiştir, ancak API olmayan isteklerde `record_audit()` IP/UA/actor bilgilerini otomatik çözemez (manuel parametrelerle çalışmaya devam eder).
3.  **Frontend (Admin Panel):** Kayıtların listelendiği ve detaylı analiz edildiği arayüz.

## Veri Modeli (`AuditLog`)

Her denetim kaydı şu bilgileri içerir:

| Alan | Açıklama |
| :--- | :--- |
| **Actor** | İşlemi yapan kullanıcı (FK User). |
| **Action** | Gerçekleştirilen eylem (Örn: `order.cancelled`, `stock.movement.created`). |
| **Target** | İşlemin yapıldığı nesne (Örn: Sipariş #123, Stok Kalemi: "Domates"). |
| **Branch** | İşlemin gerçekleştiği şube. |
| **IP Address** | İşlemin yapıldığı cihazın IP adresi. |
| **User Agent** | Tarayıcı ve cihaz bilgisi. |
| **Before/After JSON** | Verinin işlemden önceki ve sonraki hali (Diff analizi için). |
| **Metadata** | İptal gerekçesi (`reason_code`, `reason_text`) gibi ek veriler. |

## Kritik İş Akışları ve Denetim

### 1. Sipariş İptalleri
Sipariş veya ürün iptal edilirken kullanıcıdan bir **Gerekçe Kategorisi** ve **Açıklama** girmesi zorunludur. Bu veriler audit loguyla eşleştirilir.
*   **İptal Nedenleri:** `MISTAKE` (Hata), `CUSTOMER_CANCEL` (Müşteri Vazgeçti), `OUT_OF_STOCK` (Stok Yok) vb.
*   **Akıllı Masa İptalleri:** Akıllı masa (`smart_table`) üzerinden yapılan iptal işlemlerinde denetim kaydına metadata alanında `source = "smart_table"` eklenir. İptal eylemi (`order_item.cancelled` veya `order.cancelled`) olarak kaydedilir ve gerekçe metnine otomatik olarak "Müşteri Smart Table üzerinden iptal etti" yazılır.

### 2. İndirim İşlemleri
Sipariş veya ürün bazlı uygulanan tüm indirimler, indirim tutarı ve işlemi yapan yetkili bilgisiyle günlüklenir.

### 3. Stok Hareketleri
Stok girişleri, çıkışları, düzeltmeler ve hareket silme işlemleri, stok miktarlarındaki değişimlerle birlikte (öncesi/sonrası) kaydedilir.

### 4. Vardiya İşlemleri
Vardiya açma/kapatma, gider ekleme ve kasa giriş/çıkış hareketleri audit log'a yazılır (`shift.opened`, `shift.closed`, `shift.expense_added`, `shift.cash_movement.in|out`). Kapalı vardiya düzeltmeleri `shift.update_closing` ile before/after JSON tutar.

### 5. POS Idempotency
Çevrimdışı senkron çakışmaları (`pos.idempotency.conflict`, `pos.idempotency.scope_mismatch`) denetim kaydına alınır; başarılı ilk işlemler mevcut sipariş audit'leri üzerinden izlenir.

### 6. Depo İş Akışları
Transfer, satın alma siparişi, mal kabul, stok sayımı ve eksik listesi yaşam döngüsü olayları audit log'a yazılır:
* `warehouse.transfer.created|approved|completed|cancelled`
* `warehouse.purchase_order.approved|cancelled`
* `warehouse.goods_receiving.completed`
* `warehouse.stock_counting.approved`
* `warehouse.deficiency_report.approved|cancelled|ordered`
* `warehouse.purchase_recommendation.committed` (önceden mevcut)

### 7. Üretim Planlama — 86 Otomatik Temizlik
Gece Celery görevi (`purge-expired-86-nightly`) geçmiş `ProductDayAvailability` kayıtlarını soft-delete ederken audit log'a yazar:
* `production_planning.availability.auto_purged` — kayıt başına (before JSON + metadata)
* `production_planning.availability.purge_expired_completed` — toplu özet (silinen adet, şube listesi)
* Bkz. [[Production_Planning#Gece otomatik temizlik (86)]], [[Celery_Tasks#purge_expired_product_day_availability]]

## Yetkilendirme (RBAC)

Denetim kayıtlarına erişim sıkı bir şekilde kontrol edilir:

*   **`audit.view_auditlog`:** Kayıtları görüntüleme yetkisi.
*   **`audit.export_auditlog`:** Kayıtları CSV olarak dışa aktarma yetkisi. API: `GET /audit/logs/export/` (liste ile aynı filtreler). Admin sekmesinde dışa aktarma düğmesi bu izin olmadan gösterilmez.
*   **Branch Scope:** Şube yöneticileri sadece kendi şubelerine ait logları görebilir. Sistem yöneticileri tüm logları görür.

## Arayüz ve Kullanım

Loglara erişmek için ana menüdeki **"Sistem > Denetim Kayıtları"** yolunu izleyebilirsiniz. 
*   **Arama:** Kullanıcı adı, eylem veya hedef nesneye göre arama yapılabilir.
*   **CSV dışa aktarma:** Admin sekmesindeki düğme `GET /audit/logs/export/` çağırır (`audit.export_auditlog` gerekir). Aktif arama kutusu `search` parametresi olarak backend'e iletilir; branch scope ve RBAC filtreleri uygulanır.
*   **Filtreleme:** Şube, eylem tipi ve tarih aralığına göre filtreleme mümkündür.
*   **Detay Paneli:** Bir kayda tıklandığında, sağ tarafta verideki değişimler (JSON Snapshot) ve teknik cihaz bilgileri görüntülenir.

---
*İlgili Dosyalar:*
- `backend/apps/audit/models.py`
- `backend/apps/audit/middleware.py`
- `frontend/src/features/admin/components/tabs/AuditTab.tsx`
