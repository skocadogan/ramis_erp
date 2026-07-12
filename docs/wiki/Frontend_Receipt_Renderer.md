# Frontend Receipt Renderer — İstemci ESC/POS Renderer

- **Özet:** Backend'deki Python `ReceiptRenderer.render_to_text()` fonksiyonunun TypeScript aynasıdır. Termal yazıcı önizlemesi ve fiş tasarımcısı için kullanılır. ESC/POS blok şemasını (text, divider, key_value, item_loop, feed, cut, qr, date, time) metin çıktısına dönüştürür.
- **Kütüphaneler:** TypeScript (saf)
- **Bağlantılar:** [[ReceiptTemplate]], [[ReceiptDesignerTab]], [[Printing]]

---

## Desteklenen Blok Türleri

| Blok Türü | Açıklama | Örnek Çıktı |
|-----------|----------|-------------|
| `text` | Düz metin satırı, hizalama desteği | `RAMIS RESTORAN` |
| `divider` | Kağıt genişliğinde ayırıcı | `--------------------------------` |
| `key_value` | Anahtar-değer çifti, iki yana yaslı | `Masa:              Masa 5` |
| `item_loop` | Sipariş kalemleri döngüsü; `{{ name | with_options }}` seçenek alt satırı; `{{ name | with_tax_rates }}` KDV alt satırı | `Mercimek … 150 TL` + `% 10 … 15 TL` |
| `feed` | Boş satır ekleme | (boşluk) |
| `cut` | Kağıt kesme komutu | `[CUT]` |
| `qr` | QR kodu | (placeholder) |
| `date` | Tarih bloğu | `29.05.2026` |
| `time` | Saat bloğu | `14:30` |

---

## Değişken Sistemi

`{{ }}` söz dizimi ile şablon değişkenleri çözümlenir:

```
{{ order.total | currency }}     → "₺1.234,56"
{{ order.date | date_tr }}       → "29.05.2026"
{{ item.quantity | qty }}        → "2,00"
{{ tax.rate | rate 8 }}          → "%8"
```

### Filtreler

| Filtre | Açıklama |
|--------|----------|
| `currency` | Para birimi formatı |
| `date_tr` | Türkçe tarih formatı |
| `qty` | Miktar formatı (2 ondalık) |
| `rate` | Vergi oranı formatı |
| `with_options` | Ürün seçeneklerini `item_loop` alt satırında `* …` olarak gösterir ([[ReceiptTemplate]]) |
| `with_tax_rates` | Ürün KDV oranı/tutarını alt satırda gösterir; fiyat sütununda brüt tutar ([[ReceiptTemplate#with_tax_rates — ürün bazlı KDV (item_loop)]]) |

---

## `hide_if_empty` Davranışı

Blok içindeki tüm değişkenler boş veya sıfırsa blok render edilmez. Fiş şablonlarında isteğe bağlı alanlar (ikinci vergi satırı, indirim vb.) için kullanılır.

---

## Örnek Bağlamlar

Renderer, önizleme için hazır örnek bağlamlar içerir:

| Bağlam | Açıklama |
|--------|----------|
| `POS_RECEIPT` | Standart satış fişi |
| `KITCHEN_TICKET` | Mutfak sipariş fişi |
| `WAITER_TICKET` | Garson sipariş fişi |

---

## Kaynak Dosyalar

- [`receiptRenderer.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/receiptRenderer.ts) (~15.3KB)
