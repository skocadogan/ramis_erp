# ReceiptTemplate (ESC/POS Fiş Şablonu)

> **Özet:** Termal yazıcılar için blok tabanlı fiş şablonu modeli. HTML yerine JSON blok listesi (layout_json) kullanır; her blok ESC/POS komutlarına dönüştürülür. Şube bilgisi (branch_info), şube logosu (branch_logo), ürün seçenekleri (with_options), vergi oranı (with_tax_rates) ve modifier hesaplamalarını destekler.
> **Kütüphaneler:** Django ORM (JSONField), python-escpos, PIL (logo dithering)
> **Bağlantılar:** [[Reporting]], [[Printing]], [[ReceiptDesignerTab]], [[Branches]]

---

## Konum
- `backend/apps/reporting/models.py` — `ReceiptTemplate` sınıfı
- `backend/apps/reporting/serializers.py` — `ReceiptTemplateSerializer`
- `backend/apps/reporting/services/receipt_renderer.py` — `ReceiptRenderer` servisi
- `backend/apps/reporting/receipt_views.py` — `ReceiptTemplateViewSet`
- `backend/apps/reporting/migrations/0004_template_slug_unique_among_active.py` — slug uniqueness migration

---

## Model Alanları

| Alan | Tip | Varsayılan | Açıklama |
|------|-----|-----------|----------|
| `name` | `CharField(150)` | — | Şablon adı |
| `slug` | `SlugField(150)` | — | URL kodu (yalnız aktif kayıtlarda tekil) |
| `category` | `ReceiptCategory` | `POS_RECEIPT` | Fiş türü |
| `paper_width` | `SmallIntegerField` | `48` | ch/satır (58mm=32, 80mm=48) |
| `layout_json` | `JSONField` | `[]` | Blok listesi |
| `is_default` | `BooleanField` | `False` | Kategori başına varsayılan |
| `is_active` | `BooleanField` (BaseModel) | `True` | Soft-delete |

**Kategori Seçenekleri:** `POS_RECEIPT`, `KITCHEN_TICKET`, `WAITER_TICKET`

### Constraints

| Constraint | Etki |
|------------|------|
| `unique_default_receipt_per_category` | Aynı kategoride yalnızca bir aktif varsayılan şablon olabilir. |
| `uniq_receipttemplate_slug_among_active` | Slug yalnız `is_active=True` kayıtlarda tekildir. Soft-delete sonrası slug yeniden kullanılabilir. |

---

## layout_json Blok Şeması

```json
[
  { "type": "text",      "content": "{{ branch_name }}", "align": "center", "bold": true, "size": "double", "margin_left": 0, "margin_right": 0 },
  { "type": "date",      "align": "right", "bold": false },
  { "type": "time",      "align": "right" },
  { "type": "divider",   "char": "-" },
  { "type": "key_value", "left": "Masa:", "right": "{{ table_name }}", "bold": false, "hide_if_empty": true },
  { "type": "item_loop", "variable": "items", "columns": [
      { "field": "name",  "width": 20, "align": "left" },
      { "field": "qty",   "width": 5,  "align": "right", "prefix": "x" },
      { "field": "price", "width": 10, "align": "right", "format": "currency" }
  ]},
  { "type": "key_value", "left": "Ara Toplam:", "right": "{{ subtotal | currency }}" },
  { "type": "key_value", "left": "İndirim:", "right": "{{ discount | currency }}", "hide_if_empty": true },
  { "type": "key_value", "left": "KDV (%20):", "right": "{{ tax | rate 20 | currency }}" },
  { "type": "key_value", "left": "TOPLAM:", "right": "{{ total | currency }}", "bold": true },
  { "type": "qr",        "data": "https://example.com/order/{{ order_number }}" },
  { "type": "feed",      "lines": 2 },
  { "type": "cut" }
]
```

### Blok Tipleri

| Tip | Önemli alanlar |
|-----|-----------------|
| `text` | `content`, `align`, `bold`, `size: normal/double`, `margin_left`, `margin_right` |
| `divider` | `char` |
| `key_value` | `left`, `right`, `bold` (sağ taraf çok satırlı olabilir) |
| `item_loop` | `variable` (varsayılan `items`), `columns[].field/width/align/format/prefix/suffix`; seçenek satırı için `field: "{{ name | with_options }}"` veya `format: "with_options"` — bkz. [[#with_options — ürün seçenekleri (item_loop)]] |
| `feed` | `lines` |
| `cut` | — |
| `qr` | `data` (ESC/POS `device.qr(data, size=6)`) |
| `date` | `align`, `bold` (`%d.%m.%Y` format) |
| `time` | `align`, `bold` (`%H:%M` format) |
| `branch_logo` | `width_px` (varsayılan 384), `align` (center), `hide_if_empty`, `branch_id` — Şube logosunu termal baskıya uygun 1-bit bitmap'e dönüştürerek basar (PIL + Floyd-Steinberg dithering). Logo yoksa `hide_if_empty: true` ile gizlenebilir. |
| `branch_info` | `fields` (liste), `hide_if_empty`, `align`, `size`, `bold`, `branch_id` — Şube bilgilerini (ad, adres, tel, vergi dairesi, vergi no, sicil no, mersis no, e-posta, web) satır satır basar. `name`/`phone`/`address` alanları etiketsiz (sadece değer), `address` wrap destekli basılır. |

### `hide_if_empty`

Tüm blok tipleri opsiyonel `hide_if_empty: true` bayrağını destekler. İlgili blok değişkenleri (örn. `right`, `content`, `data`, `item_loop.variable`) tamamen boş ya da `0` değerine çözülürse satır yazılmaz. Frontend önizlemesi (`lib/receiptRenderer.ts`) aynı kuralı uygular.

### `with_options` — ürün seçenekleri (`item_loop`)

Menü **seçenek grupları** ([[Menu]]) sipariş kaleminde seçildiyse mutfak/garson fişinde ürün adının altında ayrı bir satır basılır. Bunun için `item_loop` kolon tanımında ürün adı alanına `with_options` filtresi eklenir.

**Kolon tanımı (iki eşdeğer yol):**

```json
{ "field": "{{ name | with_options }}", "width": 30, "align": "left" }
```

veya

```json
{ "field": "name", "width": 30, "align": "left", "format": "with_options" }
```

**Örnek çıktı** (qty sütunu aynı satırda kalır; seçenekler bir alt satırda):

```text
Soslu Patlican                    1
* Aci Soslu, Karabiberli
Coban Salata                      1
```

Seçenek yoksa yalnızca ürün satırı basılır; `*` satırı eklenmez.

**Ücretli seçenekler:** Seçeneğin `price` / `price_adjustment` değeri varsa alt satırda toplam ücret `(+20)` biçiminde gösterilir (ör. `* Aci Sos, Ekstra Aci (+20)`). Satır tutarı hesabına seçenek ücretleri dahil edilir; `with_tax_rates` ile birlikte fiyat sütununda yalnızca ürün brütü, seçenek ücreti alt satırda kalır.

**Kalem bağlamı** (`items[]`):

| Anahtar | Tip | Açıklama |
|---------|-----|----------|
| `name` | string | Ürün adı |
| `qty` | number | Adet |
| `modifiers` | string | Virgülle ayrılmış seçenek adları (POS sepet / mobil garson baskı context'i) |
| `modifier_names` | string[] | Seçenek adları listesi (tercih edilen; `enrich_print_context_from_order` bunu doldurur) |

`print_thermal` isteğinde `order_id` varsa `enrich_print_context_from_order()` kalemleri DB'den yeniden yükler; istemci `modifiers` göndermese bile seçenekler fişe yansır (`OrderItemModifier` → `modifier.name`).

**Metin bloklarında** `{{ name | with_options }}` tek satır yerine `\n` ile birleştirilmiş çok satırlı metin üretir; `item_loop` içinde ise ad + qty satırından sonra ayrı `* …` satırı tercih edilir.

**Not:** Termal yazıcı ASCII dönüşümü (`turkish_to_escpos`) nedeniyle `ı→i`, `ş→s`, `ç→c` gibi dönüşümler görülebilir.

**Mutfak fişi örnek bloğu:**

```json
{
  "type": "item_loop",
  "variable": "items",
  "columns": [
    { "field": "{{ name | with_options }}", "width": 30, "align": "left" },
    { "field": "qty", "width": 5, "align": "right", "format": "qty" }
  ]
}
```

Backend ve frontend önizleme aynı kuralı uygular: `receipt_renderer.py` → `_item_loop_lines`, `lib/receiptRenderer.ts` → `item_loop` case.

### Modifier Hesaplama İyileştirmeleri (2026-06-27)

**`modifier_entries` desteği:** Her kalem için yeni `modifier_entries` (liste, `{name, price}`) formatı desteklenir. Çözümleme önceliği: `modifier_entries` > `modifiers` (liste dict) > `modifier_names` (liste string) > `modifiers` (string).

**Fonksiyonlar:**
| Fonksiyon | İşlev |
|-----------|-------|
| `_normalize_modifier_entries(item)` | Tüm kaynaklardan `{name, price}` listesine dönüştürür |
| `_item_unit_modifier_sum(item)` | Tüm modifier ücretlerini toplar |
| `_item_paid_modifier_total(item)` | Yalnızca ücretli (price > 0) modifier'ların toplamı |

`product_only_gross` hesaplaması: KDV çözümünde ürün brütü ve modifier ücreti ayrıştırılır — modifier ücretleri genelde KDV'sizdir, yalnızca ürün brütü KDV'den arındırılır.

### `branch_logo` / `branch_info` Blokları ve Print Context Zenginleştirme (2026-06-27)

**`enrich_print_context_from_branch(context, fallback_branch_id=None)`:**
- Context'ten, `fallback_branch_id`'den veya `order_id` üzerinden **branch ID** çözülür
- Branch modelinden `branch_name`, `branch_address`, `branch_phone`, `branch_email`, `branch_website`, `branch_tax_office`, `branch_tax_number`, `branch_registry_no`, `branch_mersis_no`, `branch_logo_url` alınır
- Context'te boş alanlar DB'den doldurulur; **mevcut değerler korunur** (override edilmez)
- Hem `print_thermal` API action'ında hem de Celery `execute_receipt_print_job` task'inde çağrılır

**`enrich_print_context_from_order(context)`:**
- `order_id`'den siparişi DB'den yükler, `branch_id`, `order_number`, `sale_id`, `customer_name`, `notes` doldurur
- `kitchen_station_id` varsa `station_name` çözülür
- Kalemler (`items`) DB'den okunup uygun formata çevrilir

**`branch_logo` ESC/POS davranışı:**
- `_branch_logo_available()` → logo var mı kontrol
- `_resolve_branch_logo_path()` → disk yolu (DB `logo.path` veya `MEDIA_ROOT` + URL)
- PIL ile 1-bit termal baskı: `_flatten_logo_for_thermal()` (RGBA→beyaz zemin), `_logo_to_escpos_bitmap()` (Floyd-Steinberg dithering), `_align_logo_on_paper()` (center/left/right)
- `_paper_pixel_width()` — 48 ch → 576px, 32 ch → 384px

**`branch_info` alan etiketleri (`BRANCH_FIELD_LABELS`):**
| Alan | Etiket | Özel Davranış |
|------|--------|--------------|
| `name` | — | Yalnız değer (etiketsiz) |
| `phone` | — | Yalnız değer |
| `address` | — | Yalnız değer + wrap destekli |
| `email` | E-posta | `Etiket: Değer` |
| `website` | Web | `Etiket: Değer` |
| `tax_office` | Vergi Dairesi | `Etiket: Değer` |
| `tax_number` | Vergi No | `Etiket: Değer` |
| `registry_no` | Sicil No | `Etiket: Değer` |
| `mersis_no` | Mersis No | `Etiket: Değer` |

### `with_tax_rates` — ürün bazlı KDV (`item_loop`)

POS ödeme fişlerinde her sipariş kaleminin [[Menu]] ürünündeki `tax_rate` değerine göre KDV satırı basılır. `with_options` ile birlikte kullanılabilir.

**Kolon tanımı (iki eşdeğer yol):**

```json
{ "field": "{{ name | with_tax_rates }}", "width": 30, "align": "left" }
```

veya

```json
{ "field": "name", "width": 30, "align": "left", "format": "with_tax_rates" }
```

Seçenek + KDV birlikte:

```json
{ "field": "{{ name | with_options | with_tax_rates }}", "width": 30, "align": "left" }
```

**Örnek çıktı** (`price` sütunu brüt / KDV hariç; seçenekler `*` satırında; KDV alt satırda):

```text
Mercimek Corbasi                    1 Az        150,00 TL
* Ekstra Soslu
  % 10                               15,00 TL
Americano                           2 Adet       41,67 TL
  % 20                               16,67 TL
```

**Fiyat sütunu davranışı:** `item_loop` bloğunda herhangi bir ad kolonu `with_tax_rates` kullanıyorsa, `price` / `total` para sütunları **brüt (KDV hariç)** tutarı basar; kullanılmıyorsa mevcut davranış (net satış / KDV dahil `unit_price`) korunur.

**Kalem bağlamı** (`items[]`):

| Anahtar | Tip | Açıklama |
|---------|-----|----------|
| `tax_rate` | number | Ürün vergi oranı (%) — `enrich_print_context_from_order` ve POS sepet context'i doldurur |
| `line_net` | number | KDV dahil satır tutarı (`price × qty`) |
| `line_gross` | number | KDV hariç satır tutarı |
| `line_tax` | number | Satır KDV tutarı |

**Alt toplam KDV:** `{{ tax | currency }}` (`rate` filtresi **yokken**) şablonda `with_tax_rates` kullanılıyorsa tüm kalemlerin `line_tax` toplamını yazar. **`{{ subtotal | currency }}`** aynı modda kalemlerin **brüt (KDV hariç)** `line_gross` toplamını; **`{{ total | currency }}`** indirim düşüldükten sonra **KDV dahil** net toplamı otomatik hesaplar.

**Not:** `with_tax_rate` (tekil) alias olarak desteklenir.

---

## ReceiptRenderer

`services/receipt_renderer.py`

| Metot | Çıktı |
|-------|-------|
| `render_to_text(layout, context)` | Monospace metin (frontend önizleme) |
| `render_to_escpos(layout, context, device)` | python-escpos device'a doğrudan yazma |

### `_prepare_context` davranışı

- `payment_method` veya `payment_type` yalnız biri varsa diğerini eşler (Türkçe etiket — bölünmüş ödemede özet string).
- **`payments` listesi:** Birden fazla kalem varsa, tutarları pozitif olan satırlardan çok satırlı özet üretilir ve `payment_method` / `payment_type` bu özet ile güncellenir. Böylece şablondaki `{{ payment_type }}` ile API/istemci uyumsuzluğunda eksik kalan **Diğer (`OTHER`)** satırı, yapılandırılmış listede varsa tamamlanır. Satır etiketi için `payment_method_display` (SalePayment) önceliklidir; yoksa `method` / `payment_method` alanı `CASH`/`CARD`/`OTHER` kodlarından Türkçe karşılığa çevrilir.
- Tek kalemli `payments` ile her iki ödeme alanı da boşsa özet tek satırla doldurulur; aksi halde mevcut kısa etiket (örn. yalnız «Nakit») korunur.
- Bağlamda `date` veya `time` yoksa, `created_at` (**ISO 8601** — `fromisoformat`) parse edilir; başarısız parse veya alan yoksa `timezone.localtime()` (yazdırma anı) kullanılır.
- İstemci ctx'e `date` ve `time` **açıkça** koyarsa backend bunları değiştirmez. Geçmiş satış fiş yeniden baskısında [[Frontend_Tables#Tarih ve saat (date / time)|buildReceiptDateTimeContext]] sipariş tarihini gönderir; `toLocaleString("tr-TR")` ile gönderilen `created_at` parse edilemediği için tek başına yeterli değildir.

### İstemci önizleme (`lib/receiptRenderer.ts`)

- `prepareReceiptContext()` yukarıdaki ödeme birleştirme kurallarını tekrarlar; `renderReceiptToText` render öncesi çağırır.
- `SAMPLE_CONTEXTS.POS_RECEIPT` bölünmüş örnekte Nakit, Kredi Kartı ve **Diğer** satırlarını içerir.

### Değişken sözdizimi

`{{ var }}`, `{{ var | filter }}` zincirlenebilir. Filtreler:

| Filtre | Etki |
|--------|------|
| `currency` | `1234.56` → `1.234,56 TL` |
| `qty` | `2.00` → `2`; `1.5` → `1,5` |
| `date_tr` | `datetime`/ISO → `dd.mm.YYYY` |
| `rate X` | Sayıyı %X ile çarpar; **`tax | rate X`** özel durumunda baz olarak `total` alınır → KDV satırı |
| `with_options` | `item_loop` kolonunda ürün adı + alt satırda `* seçenek1, seçenek2`; metin bloklarında `\n` ile birleşik çıktı |
| `with_tax_rates` | `item_loop` ad kolonunda ürün bazlı KDV satırı (`% oran` + tutar); fiyat sütunu brüt basar; bkz. [[#with_tax_rates — ürün bazlı KDV (item_loop)]] |

### Üst seviye bağlam değişkenleri

Metin ve etiket-değer bloklarında `{{ … }}` ile kullanılır. Fiş tasarımcısı rehberi (`ReceiptDesignerGuide`) ile blok editörü paleti aynı küme ile uyumludur.

| Değişken | Açıklama | Tipik kategori |
|----------|----------|----------------|
| `branch_name` | Şube adı | POS |
| `branch_address` | Şube adresi | POS |
| `branch_phone` | Şube telefonu | POS |
| `table_name` | Masa adı | Tümü |
| `waiter_name` | Garson adı | Tümü |
| `order_number` | Sipariş numarası | Tümü |
| `sale_id` | Satış UUID (ödeme sonrası; POS fişi) | POS |
| `customer_name` | Müşteri adı (varsa) | POS |
| `station_name` | Hedef mutfak istasyonu adı | KITCHEN_TICKET |
| `subtotal` | Ara toplam | POS, WAITER |
| `discount` | İndirim tutarı | POS |
| `tax` | Vergi (genelde `{{ tax \| rate 20 \| currency }}`) | POS |
| `total` | Genel toplam | POS, WAITER |
| `payment_method` | Ödeme özeti (Türkçe; bölünmüş ödemede çok satırlı) | POS |
| `payment_type` | `payment_method` ile eş anlamlı | POS |
| `created_at` | Oluşturma zamanı (ham) | Tümü |
| `date` | Tarih (`dd.mm.yyyy`); yoksa otomatik üretilir | Tümü |
| `time` | Saat (`HH:MM`); yoksa otomatik üretilir | Tümü |
| `notes` | Sipariş genel notu | Mutfak / Garson |
| `descriptions` | Notu olan kalemleri «ürün : not» biçiminde birleştirir | Mutfak |

**Not:** `date` / `time` blok tipleri (`type: date|time`) ayrıca ESC/POS tarih-saat basar; bağlamdaki `date`/`time` değişkenleri metin bloklarında kullanılır.

### Ürün listesi (`item_loop`)

| Ayar | Değer | Açıklama |
|------|-------|----------|
| `variable` | `items` (varsayılan) | Sipariş kalemleri |
| `variable` | `payments` | Bölünmüş ödeme satırları (`method`, `amount`) |

Sütun `field` değerleri (kalem bağlamı):

| Alan | Açıklama |
|------|----------|
| `name` | Ürün adı; `{{ name \| with_options }}` ile seçenek satırı; `{{ name \| with_tax_rates }}` ile KDV satırı |
| `qty` | Adet |
| `price` | Birim fiyat |
| `total` | Satır tutarı |
| `unit` | Birim adı (Adet, Porsiyon vb.) |
| `modifiers` | Virgülle ayrılmış seçenek metni |
| `modifier_names` | Seçenek adları listesi (tercih edilen kaynak) |
| `tax_rate` | Ürün KDV oranı (%) |
| `line_gross` / `line_net` / `line_tax` | Renderer tarafından hesaplanan satır tutarları (`with_tax_rates` ile) |
| `notes` / `description` | Kalem notu |

### Yaygın Bağlam Anahtarları (özet)

POS ödeme fişi (`print_thermal`):
`branch_name`, `branch_address`, `branch_phone`, `items`, `subtotal`, `discount`, `total`, `payment_method` / `payment_type`, `payments`, `table_name`, `order_number`, `sale_id`, `waiter_name`, `customer_name`, `created_at`, `date`, `time`.

Mutfak/Garson:
`station_name`, `items[].name|qty|unit|modifiers|modifier_names|notes|description`, `table_name`, `order_number`, `waiter_name`, `notes`, `descriptions`, `created_at`, `date`, `time`. Mutfak fişinde seçenek satırı için `items` kolonunda `{{ name | with_options }}` kullanın.

`SAMPLE_CONTEXTS` her kategori için tipik örnek bağlam üretir; frontend `lib/receiptRenderer.ts` da aynı yapıyı barındırır.

---

## Serializer

`ReceiptTemplateSerializer`:

- `validate_slug` — aynı slug ile başka bir aktif kayıt varsa `ValidationError`. Soft-delete edilen kaydın slug'ı tekrar oluşturulabilir.
- `validate_layout_json` — listenin her elemanının `type` alanını içerip izinli set (`text`, `divider`, `key_value`, `item_loop`, `feed`, `cut`, `qr`, `date`, `time`, `branch_logo`, `branch_info`) içinde olduğunu doğrular.

---

## API

| Method | Endpoint | Açıklama |
|--------|---------|----------|
| GET | `/reporting/receipts/` | Liste (`?category`, `?is_default` filtreleri) |
| POST | `/reporting/receipts/` | Oluştur |
| GET/PATCH/DELETE | `/reporting/receipts/{slug}/` | Detay (DELETE soft-delete) |
| POST | `/reporting/receipts/{slug}/preview_text/` | Monospace önizleme (`{ context: {...} }` opsiyonel) |
| POST | `/reporting/receipts/{slug}/print_thermal/` | Fiziksel baskı — bkz. [[Printing]] |
| POST | `/reporting/receipts/{slug}/set_default/` | Varsayılan yap (aynı kategoride diğerlerini False yapar) |
