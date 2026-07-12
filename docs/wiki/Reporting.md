# Reporting (Rapor & Fiş Şablonları)

> **Özet:** Üç katmanlı raporlama altyapısı: (1) Diğer modüller tarafından kullanılan HTML/PDF modül rapor sistemi — artık Celery tabanlı asenkron PDF desteği ile, (2) ESC/POS termal yazıcılara özel blok tabanlı fiş şablonu sistemi, (3) Async PDF cache polling altyapısı.
> **Kütüphaneler:** Django ORM, WeasyPrint, Jinja2, python-escpos, openpyxl, Celery, Redis Cache
> **Bağlantılar:** [[Invoices]], [[Printing]], [[Orders]], [[Warehouse]], [[Inventory]], [[Sales]], [[Shifts]], [[Recipes]], [[ReceiptTemplate]], [[ReceiptDesignerTab]], [[Async_PDF_Export]], [[Celery_Tasks]]

---

## Konum
`backend/apps/reporting/`

---

## ⚠️ Mimari Uyarı

Bu modülde **iki ayrı sistem** bulunur. Birbirine karıştırılmamalıdır:

| Sistem | Amaç | Kullanıcılar |
|--------|------|-------------|
| **Modül Raporu Altyapısı** | HTML/PDF rapor üretimi | Inventory, Warehouse, Sales, Shifts, Recipes, Production |
| **ESC/POS Fiş Şablonları** | Termal yazıcı fiş tasarımı | POS satışı, mutfak siparişi, garson adisyonu |

---

## 📦 Model 1: ReportTemplate (Değiştirilmez — diğer modüller bağımlı)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Şablon adı |
| `slug` | `SlugField` | Kod (yalnız aktif kayıtlar için tekil — bkz. constraint) |
| `category` | `TextChoices` | POS_RECEIPT / KITCHEN_TICKET / WAITER_TICKET / MODULE_REPORT / INVOICE / CUSTOM |
| `html_body` | `TextField` | Jinja2 HTML içeriği |
| `css_styles` | `TextField` | CSS stilleri |
| `is_default` | `BooleanField` | Varsayılan şablon |

**Constraint:** `uniq_reporttemplate_slug_among_active` — `slug` yalnız `is_active=True` satırlarda tekil. Soft-delete edilen kaydın slug’ı yeni aktif kayıtta yeniden kullanılabilir.

## 📦 Model 2: ReceiptTemplate (ESC/POS'a özel)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `name` | `CharField` | Şablon adı |
| `slug` | `SlugField` | Kod (yalnız aktif kayıtlar için tekil) |
| `category` | `TextChoices` | POS_RECEIPT / KITCHEN_TICKET / WAITER_TICKET |
| `paper_width` | `PositiveSmallIntegerField` | Satır başına karakter (58mm→32, 80mm→48) |
| `layout_json` | `JSONField` | ESC/POS blok listesi |
| `is_default` | `BooleanField` | Kategori başına varsayılan (unique constraint) |

**Constraints:**
- `unique_default_receipt_per_category` — kategori başına aktif yalnız 1 varsayılan.
- `uniq_receipttemplate_slug_among_active` — slug yalnız aktif satırlarda tekil.

**Migration:** `reporting/0004_template_slug_unique_among_active.py` her iki modele de yukarıdaki slug uniqueness kısıtını ekler.

### layout_json Blok Tipleri

| Tip | Açıklama |
|-----|----------|
| `text` | Serbest metin (`align`, `bold`, `size: normal/double`, `margin_left` / `margin_right`: satır başına karakter cinsinden iç boşluk) |
| `divider` | Yatay çizgi (`char`: `-`, `=`, `*`) |
| `key_value` | Sol–Sağ hizalı etiket–değer çifti (sağ taraf çok satırlı olabilir — örn. bölünmüş ödeme) |
| `item_loop` | Ürün listesi döngüsü (`columns`: `field`, `width`, `align`, `format: currency/qty/with_options/with_tax_rates`, `prefix`, `suffix`; seçenekler: `field: "{{ name | with_options }}"`; KDV: `field: "{{ name | with_tax_rates }}"`) |
| `feed` | Boş satır (`lines: int`) |
| `cut` | Kağıt kesme komutu |
| `qr` | QR kod (`data: string`, ESC/POS'ta `device.qr(data, size=6)`) |
| `date` | Otomatik tarih (`%d.%m.%Y` — `created_at` veya şimdi); `align`, `bold` |
| `time` | Otomatik saat (`%H:%M`); `align`, `bold` |
| `branch_logo` | Şube logosu (PIL + Floyd-Steinberg dithering ile 1-bit termal baskı); `width_px`, `align`, `hide_if_empty`, `branch_id` |
| `branch_info` | Şube bilgileri (ad, adres, tel, vergi dairesi, vergi no, sicil no, mersis no, e-posta, web); `fields`, `hide_if_empty`, `align`, `branch_id` |

### Şablon değişken filtreleri

`{{ var | filter }}` sözdizimi:

| Filtre | Açıklama |
|--------|----------|
| `currency` | `1234.56` → `1.234,56 TL` |
| `qty` | `2.00` → `2`; `1.5` → `1,5` |
| `date_tr` | `datetime` → `dd.mm.YYYY` |
| `rate X` | Sayıyı %X ile çarpar; özel durum: `tax | rate X` ifadesinde `total` baz alınır → `{{ total | rate 20 | currency }}` KDV satırını üretir |
| `with_options` | `item_loop` ürün adı kolonunda seçenekleri alt satırda `* …` olarak basar; bkz. [[ReceiptTemplate#with_options — ürün seçenekleri (item_loop)]] |
| `with_tax_rates` | `item_loop` ad kolonunda ürün bazlı KDV satırı; fiyat sütunu brüt; `{{ tax \| currency }}` kalemlerin KDV toplamı; bkz. [[ReceiptTemplate#with_tax_rates — ürün bazlı KDV (item_loop)]] |

### `hide_if_empty` (opsiyonel blok bayrağı)

Bir bloğun `hide_if_empty: true` alanı varsa, içerikteki (`content`/`left`/`right`/`data`) tüm değişkenler boş/`0` ise satır basılmaz. Sıfır indirim, sıfır vergi gibi alanları otomatik gizlemek için kullanılır. Frontend önizlemesinde de aynı kural uygulanır (`lib/receiptRenderer.ts` → `shouldSkipBlock`).

---

## 🔧 Servisler

### ReportRenderer (Korunuyor — Modül raporları kullanıyor)
`services/renderer.py` — Jinja2 ortamında HTML şablonlarını render eder.
Filtreleri: `currency`, `date_tr`, `qty`

### PDFExportService (Korunuyor — Modül raporları + Celery task kullanıyor)
`services/pdf_export.py` — WeasyPrint ile HTML → PDF dönüşümü. Hem senkron (`?async=false`) hem Celery task içinden kullanılır.

### Async PDF Service (Yeni)
`async_service.py` — Redis cache tabanlı async flow: `enqueue_pdf_export()`, `get_pdf_export_status()`. Bkz. [[Async_PDF_Export]].

### ExcelExportService (Korunuyor)
`services/excel_export.py` — openpyxl ile Excel üretimi.

### ReceiptRenderer
`services/receipt_renderer.py` — layout_json bloklarını:
- `render_to_text(layout, context)` → monospace metin (frontend önizleme)
- `render_to_escpos(layout, context, device)` → python-escpos device'a doğrudan yazma

`_prepare_context` otomatik alanlar üretir:
- `payment_method` ↔ `payment_type` (yalnız biri verildiyse diğerini eşler — bölünmüş ödeme Türkçe etiket).
- `created_at` (**ISO**) parse edilebilirse ondan, aksi halde `timezone.localtime()` ile `date` ve `time` doldurulur — yalnız ctx'te yoksa. Yerel locale string (`28.06.2026 14:30:45`) parse edilmez → yazdırma anı basılır; geçmiş satış yeniden baskısında istemci `date`/`time`/`created_at`(ISO) açık gönderir ([[Frontend_Tables#Tarih ve saat (date / time)]]).

Metin bloğunda `margin_left` / `margin_right` ile hizalama alanı daraltılır; önizleme (`frontend/src/lib/receiptRenderer.ts`) aynı kuralları uygular.

### `SAMPLE_CONTEXTS`
`receipt_renderer.SAMPLE_CONTEXTS` — kategori bazlı örnek bağlam (POS_RECEIPT için `subtotal`, `discount`, `payment_method`, `payments`; KITCHEN_TICKET için `station_name`, `items.modifiers`, `items.notes`; WAITER_TICKET için kalemler ve toplam). Frontend önizlemesi de paralel `SAMPLE_CONTEXTS`'i `lib/receiptRenderer.ts` içinde tutar.

---

## 🌐 API Endpoint'leri

| Endpoint | Açıklama |
|---------|----------|
| `GET /reporting/templates/` | HTML şablon listesi (eski sistem) |
| `GET/POST /reporting/module-reports/` | Modül raporu listesi/üretimi |
| `POST /reporting/module-reports/{slug}/generate/?async=true` | **Yeni** — Asenkron PDF: `202 {task_id, cache_key}` döner; [[Async_PDF_Export]] |
| `GET /reporting/module-reports/export-status/?cache_key=...` | **Yeni** — Async PDF durum sorgulama |
| `GET /reporting/receipts/` | ESC/POS fiş şablon listesi (?category, ?is_default filtreleri) |
| `POST /reporting/receipts/` | Yeni şablon oluştur |
| `PATCH /reporting/receipts/{slug}/` | Şablon güncelle |
| `DELETE /reporting/receipts/{slug}/` | Soft-delete |
| `POST /reporting/receipts/{slug}/preview_text/` | Monospace metin önizleme |
| `POST /reporting/receipts/{slug}/print_thermal/` | Fiziksel yazıcıya gönder — bkz. [[Printing]] |
| `POST /reporting/receipts/{slug}/set_default/` | Varsayılan şablonu toggle et (aynı kategoride diğerlerini False yapar) |

### `print_thermal` davranış matrisi

| Senaryo | Yanıt | Açıklama |
|---------|-------|----------|
| `settings.PRINT_THERMAL_SYNC=True` (DEBUG zorunlu yapar) | `200` (`completed`) ya da `500` (`failed`) | Celery worker olmadan görev `execute_receipt_print_job.run(job_id)` ile aynı isteği bloklayarak işler. |
| Üretim (PRINT_THERMAL_SYNC=False) | `202` (`queued`) | `execute_receipt_print_job.delay(job_id)` ile kuyruğa alınır. |
| Celery dispatch hatası | `503` | İş `PrintJob.PENDING` kalır, mesaj döner. |
| Yazıcı bulunamadı | `404` | Aktif olmayan/silinen yazıcı. |
| `printer_id` eksik | `400` | Zorunlu alan. |
| `idempotency_key` daha önce görüldü | `202` (mevcut `print_job_id` ile) | Aynı anahtarla çift fiş engellenir. |

### Permission haritası
`reporting.view_report_template`, `reporting.manage_report_template`, `reporting.generate_report` (yalnız `print_thermal`).

---

## 🗂️ Modül Raporu Bağımlılıkları (DOKUNULMAZ)

Bu dosyalar **6 farklı modül** tarafından kullanılır:

```
reports/base_report.py    ← BaseModuleReport base class
registry.py               ← Singleton report_registry
module_views.py           ← ModuleReportViewSet
```

Bağımlı modüller ve rapor sayıları:
- [[Inventory]] — 5 rapor
- [[Warehouse]] — 2 rapor
- [[Sales]] — 1 rapor
- [[Shifts]] — 2 rapor
- [[Recipes]] — 1 rapor
- [[Production_Planning]] — 2 rapor (MRP, yaklaşık maliyet FEFO + hammadde kırılımı)

### Üretim planı yaklaşık maliyet raporu (`production-plan-approximate-cost`)

| Katman | Dosya | İçerik |
|--------|-------|--------|
| Backend | `production_planning/reports.py` → `ProductionPlanApproximateCostReport` | `get_context`, `get_excel_data` |
| PDF şablon | `production_planning/templates/reports/approximate_cost_pdf.html` | Ürün satırı + `ingredients` alt satırları |
| Veri | `approximate_cost_service.calculate_approximate_cost_for_plan` | FEFO porsiyon maliyeti + hammadde listesi |

Excel sütunları: Ürün/Hammadde, İstasyon, Miktar, Birim, Birim Maliyet (FEFO), Toplam.

---

## 🎨 Frontend

### Async PDF Button (Yeni)
`frontend/src/components/AsyncPdfExportButton.tsx` — 18 modül raporu bileşeninde kullanılan paylaşımlı buton. `fetchAsyncPdf()` + polling + loading/error/retry state yönetimi. Bkz. [[Async_PDF_Export#Frontend]].

### Eski (Korunuyor — mevcut API uyumu)
`features/admin/services/adminApi.ts` → `getReportTemplates`, `previewReport`, `generateModuleReport` (senkron mod korunuyor).

HTML `ReportTemplate` gövdesi için `reporting/ReportEditor.tsx` değişken paletinde **İndirim** (`{{ discount | currency }}`) ve **Ödeme Tipi** (`{{ payment_method }}`) eklenebilir; gerçek PDF/HTML bağlamında bu anahtarları ilgili modülün sağlaması gerekir.

### Yeni (ESC/POS Tasarımcı) — bkz. [[ReceiptDesignerTab]]
`features/admin/components/tabs/ReportingTab.tsx` — Liste ve editör görünümü (kategori filtresi, varsayılan yıldız aksiyonu, dış mod-içine büyütme, kopyalama, içe/dışa aktarma).

Alt bileşenler:
- `reporting/ReceiptBlockEditor.tsx` — Blok paleti + inline editör; palet `text`, `divider`, `key_value`, `item_loop`, `feed`, `cut`, `qr`, `date`, `time`, `branch_logo`, `branch_info` tiplerini içerir.
- `reporting/ReceiptPreview.tsx` — Monospace kağıt simülasyonu.
- `reporting/ReceiptDesignerGuide.tsx` — Modal halinde kullanım rehberi (blok tipleri, filtreler, değişkenler ve teknik limitler).
