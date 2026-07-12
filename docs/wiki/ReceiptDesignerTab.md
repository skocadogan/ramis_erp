# ReceiptDesignerTab (ESC/POS Fiş Tasarımcısı)

> **Özet:** `panel?tab=reporting` sekmesinin yeni yüzü. ESC/POS termal yazıcılar için blok tabanlı fiş şablonu tasarım editörü. HTML editör yerine yapılandırılmış blok sistemi ve canlı monospace önizleme sunar.
> **Kütüphaneler:** React, Next.js, Lucide Icons, Sonner (toast)
> **Bağlantılar:** [[Reporting]], [[ReceiptTemplate]], [[Printing]], [[Frontend_Admin]]

---

## Konum
- `frontend/src/features/admin/components/tabs/ReportingTab.tsx` — Ana tab bileşeni (liste/edit modları)
- `frontend/src/features/admin/components/tabs/reporting/ReceiptBlockEditor.tsx` — Blok editörü
- `frontend/src/features/admin/components/tabs/reporting/ReceiptPreview.tsx` — Termal önizleme
- `frontend/src/features/admin/components/tabs/reporting/ReceiptDesignerGuide.tsx` — Yardım modalı
- `frontend/src/features/admin/services/adminApi.ts` — Receipt API metodları
- `frontend/src/lib/receiptRenderer.ts` — İstemci tarafı önizleme motoru (`prepareReceiptContext`, `SAMPLE_CONTEXTS`; bkz. [[ReceiptTemplate]])

---

## Görünüm Modları

### Liste Görünümü (`mode === "list"`)
- **Yardım butonu** — `ReceiptDesignerGuide` modalını açar.
- Kategori filtresi (Tümü / POS Fişi / Mutfak / Garson)
- Şablon tablosu: ad, kategori renk etiketi, kağıt genişliği, blok sayısı, varsayılan yıldız
- Aksiyonlar: Varsayılan yap ⭐, Düzenle ✏️, Kopyala 📄, Sil 🗑️, İçe / Dışa Aktar 📤📥

### Editör Görünümü (`mode === "edit"`)
- **Üst bar:** ad, slug, kategori, kağıt genişliği seçimi + Kaydet / İptal
- **Sol panel:** `ReceiptBlockEditor` — blok paleti + sürükle-bırak sıralanabilir blok listesi
- **Sağ panel (≈280px):** `ReceiptPreview` — termal kağıt simülasyonu
- Ekrana sığmayan içerik için tam ekran (mod-içine büyütme) modu

---

## ReceiptBlockEditor

### Blok Paleti

| Tip | İkon | Açıklama |
|-----|------|----------|
| `text` | `T` | Metin (örn. başlık, alt başlık) |
| `divider` | `─` | Ayırıcı çizgi |
| `key_value` | `↔` | İki sütun (Ara Toplam, Toplam) |
| `item_loop` | `≡` | Ürün döngüsü |
| `feed` | `↵` | Boş satır |
| `cut` | `✂` | Kağıt kes |
| `qr` | `▦` | QR kod |
| `date` | `📅` | Otomatik tarih |
| `time` | `⏰` | Otomatik saat |

Her blok:
- Çökülebilir başlık (özet gösterim — `blockSummary`)
- Yukarı/aşağı taşı, sil, kopyala aksiyonları
- Blok tipine özel inline editör

### Blok Düzenleme Detayları

- **Metin (`text`)** — içerik, hizalama, boyut (`normal`/`double`), kalın; **sol boşluk** / **sağ boşluk** (karakter cinsinden `margin_left` / `margin_right`).
- **Etiket-Değer (`key_value`)** — sol & sağ alanlar; sağ alan çok satırlı olabilir.
- **Ürün Listesi (`item_loop`)** — kolon listesi: `field`, `width`, `align`, `format` (`currency` / `qty` / `with_options` / `with_tax_rates`), opsiyonel `prefix` (`x` gibi) ve `suffix`. Seçenekli ürünler için `{{ name | with_options }}`; POS KDV dökümü için `{{ name | with_tax_rates }}` ([[ReceiptTemplate#with_tax_rates — ürün bazlı KDV (item_loop)]]).
- **QR (`qr`)** — `data` alanına URL veya metin (örn. `https://example.com/order/{{ order_number }}`).
- **Date / Time** — yalnız hizalama ve kalınlık ayarı; backend `_prepare_context` eksik bağlamda otomatik üretir.
- Her blok için **Boşsa Gizle** anahtarı (`hide_if_empty`) — tüm değişkenler boş veya `0` ise satır basılmaz.

### Değişken Paleti

Tek tıkla içeriğe ekleme — şablonlarda yaygın anahtarlar (`ReceiptBlockEditor` paleti ile aynı):

```
{{ branch_name }}            {{ branch_address }}       {{ branch_phone }}
{{ table_name }}             {{ waiter_name }}          {{ order_number }}
{{ sale_id }}                {{ customer_name }}        {{ station_name }}
{{ notes }}
{{ created_at }}               {{ created_at | date_tr }} {{ date }}   {{ time }}
{{ subtotal | currency }}    {{ discount | currency }}  {{ total | currency }}
{{ tax | rate 20 | currency }}                          (KDV satırı)
{{ payment_method }}         {{ payment_type }}         {{ descriptions }}
```

**Ürün listesi sütun alanları:** `name`, `qty`, `price`, `total`, `unit`, `tax_rate`, `modifiers`, `modifier_names`, `notes`, `description` — döngü değişkeni `items` veya bölünmüş ödeme için `payments`.

`payment_method` ile `payment_type` şablonda eş anlamlıdır; backend `_prepare_context` eksik olanı tamamlar.

### Ödeme Fişi Bağlamı

Masa ödemesi sonrası otomatik yazdırmada (`useTableOrderModal.ts` → `triggerReceiptPrint`) bağlama şunlar eklenir:
`subtotal` (indirim öncesi ara toplam), `discount` (sipariş indirimleri), `total`, `payment_method` ve `payment_type` (Türkçe etiket; bölünmüş ödemede `"Nakit 10,00 ₺ + Kart 20,00 ₺"` biçimi), `payments[].amount/method`. İstek `idempotencyKey` ile gönderilir → çift fiş engellenir.

**Manuel yeniden baskı** ([[Frontend_Tables]], [[Frontend_Sales]]): Aktif adisyonda `dispatchOrderReceiptPrints`; geçmiş satışta tamamlanmış `sale` ödeme alanları + `buildReceiptDateTimeContext` ile sipariş `created_at` → `date`/`time`/`created_at`(ISO). Mutfak fişinde `order_id` + `kitchen_station_id` ile `enrich_print_context_from_order` kalemleri yeniden yükler. Idempotency öneki `reprint:{uuid}:…`.

---

## ReceiptDesignerGuide (Yardım Modalı)

`ReceiptDesignerGuide.tsx` modalı şu bölümleri içerir:

1. **Blok Tipleri** — metin, etiket-değer, ürün listesi, boşsa gizle
2. **Filtreler** — `currency`, `qty`, `date_tr`, `rate X`, `with_options`, `with_tax_rates`
3. **Değişkenler** — üst seviye `{{ … }}` anahtarları (şube, sipariş, tutar, ödeme, tarih, not, istasyon vb.)
4. **Ürün listesi sütun alanları** — `name`, `qty`, `price`, …; döngü değişkeni `items` / `payments`
5. **Kurallar & İpuçları** — kağıt genişliği (32 ch / 48 ch), `hide_if_empty`, bölünmüş ödeme, `descriptions`, `with_options`, `with_tax_rates`

Tam liste: [[ReceiptTemplate#Üst seviye bağlam değişkenleri]]

---

## ReceiptPreview

- Backend `preview_text` endpoint'ini çağırır (yedek olarak istemci `lib/receiptRenderer.ts` ile bağlam render edebilir).
- 58 mm (32 ch) / 80 mm (48 ch) kağıt genişliğine göre boyutlanır.
- `Courier New` monospace font; üst bant + yırtık alt kenar (CSS mask).
- Şablon veya blok değiştiğinde otomatik yeniler.

İstemci tarafı `lib/receiptRenderer.ts` SAMPLE_CONTEXTS:
- `POS_RECEIPT` — örnek ürünler, `subtotal`, `discount`, `payments[]`, `payment_method`, `date`, `time`.
- `KITCHEN_TICKET` — `station_name`, `items[].modifiers/notes`, `table_name`.
- `WAITER_TICKET` — kalem ve toplam.

---

## API Kullanımı

`adminApi.ts` receipt metodları:

```typescript
adminApi.getReceiptTemplates({ category? })
adminApi.getReceiptTemplate(slug)
adminApi.createReceiptTemplate(form)
adminApi.updateReceiptTemplate(slug, form)
adminApi.deleteReceiptTemplate(slug)
adminApi.duplicateReceiptTemplate(slug)
adminApi.previewReceiptText(slug, context?)
adminApi.printReceiptThermal(slug, printerId, context?, idempotencyKey?)
adminApi.setReceiptDefault(slug)
```

---

## Tip Tanımları

```typescript
type ReceiptCategory = "POS_RECEIPT" | "KITCHEN_TICKET" | "WAITER_TICKET"
type ReceiptBlockType = "text" | "divider" | "key_value" | "item_loop" | "feed" | "cut" | "qr" | "date" | "time"

interface ReceiptBlock {
  type: ReceiptBlockType
  content?: string
  align?: "left" | "center" | "right"
  bold?: boolean
  size?: "normal" | "double"
  margin_left?: number
  margin_right?: number
  char?: string
  left?: string
  right?: string
  variable?: string
  columns?: { field: string; width: number; align?: string; format?: "currency" | "qty"; prefix?: string; suffix?: string }[]
  data?: string         // qr
  lines?: number        // feed
  hide_if_empty?: boolean
}

interface ReceiptTemplate {
  id: number
  name: string
  slug: string
  category: ReceiptCategory
  paper_width: number
  layout_json: ReceiptBlock[]
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}
```
