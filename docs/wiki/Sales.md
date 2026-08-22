# Sales (Satış ve Ödeme)

> **Özet:** Sipariş kapatma ve ödeme kayıt sistemi. Nakit, kart ve diğer ödeme yöntemleri, bölünmüş ödeme (split payment) ve indirim takibi desteklenir.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Orders]], [[Shifts]], [[Invoices]], [[POS_Display]], [[Branches]], [[Fiscal_Integration]]

---

## Konum
`backend/apps/sales/`

## Modeller

### Sale
| Alan | Tip | Açıklama |
|------|-----|----------|
| `order` | `OneToOne → Order` | Kapatılan sipariş |
| `branch` | `FK → Branch` | Şube |
| `shift` | `FK → Shift` | Vardiya |
| `pos_terminal` | `FK → PosTerminal` | POS terminali |
| `created_by` | `FK → User` | İşlemi yapan |
| `payment_method` | `TextChoices` | CASH / CARD / OTHER / CREDIT |
| `is_split_payment` | `BooleanField` | Bölünmüş ödeme |
| `total_amount` | `DecimalField(12,4)` | Toplam tutar |
| `discount_amount` | `DecimalField` | İndirim |
| `is_deleted` | `BooleanField` | Soft-delete (satış iptal) |
| `fiscal_printed` | `BooleanField` | Mali Fiş basıldı mı? |
| `okc_serial_number` | `CharField` | Yazar Kasa Seri No |
| `okc_receipt_number`| `CharField` | Mali Fiş No |
| `okc_z_number` | `CharField` | Z Raporu No |
| `okc_receipt_datetime`| `DateTimeField` | Fiş Mali Basım Saati |
| `fiscal_qr_code` | `TextField` | Mali Karekod Verisi |
| `fiscal_raw_response`| `JSONField` | Mali Cihaz Ham Yanıtı |

### SalePayment
Bölünmüş ödemelerin alt kalemleri.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `sale` | `FK → Sale` | Satış |
| `payment_method` | `TextChoices` | Ödeme yöntemi |
| `amount` | `DecimalField` | Tutar |

## Services
`services.py` — Satış oluşturma, iptal ve vardiya entegrasyonu. `return_sale` satış satırını `select_for_update(nowait=True)` ile kilitler (eşzamanlı çift iade).

### Bölünmüş ödeme (split payment)
- **Tek sipariş:** `POST /orders/main/{id}/complete/` → `payments[]` doğrudan o siparişin `Sale` kaydına yazılır (`create_sale_for_order`).
- **Masa (çoklu sipariş):** `POST /orders/main/complete_table/` → `payments[]` masa genel toplamına karşı doğrulanır; `distribute_table_payments` ile her sipariş tutarına orantılı dağıtılır; sipariş başına ayrı `Sale` + `SalePayment` satırları oluşur.
- Dağıtım: her ödeme yöntemi satırı sipariş tutarlarına göre bölünür; son siparişe yuvarlama farkı yazılır.

### Yazar Kasa / Mali Entegrasyon Tetiklemesi
- Satış oluşturma sürecinde (`create_sale_for_order`), eğer ödemeyi alan terminalde bir yazar kasa (`fiscal_type` != NONE) tanımlıysa, ilgili mali sürücü dinamik olarak çağrılır.
- Yazar kasa fişi veya mali onay başarıyla alınırsa satış tamamlanır.
- Yazar kasadan hata alınırsa (`OrderValidationError`), Django'nun atomik veritabanı işlemleri (`transaction.atomic`) sayesinde **veritabanı rollback'i** yapılır; ne `Sale` ne de `SalePayment` kayıtları oluşturulmaz. Ayrıntılı mimari için: [[Fiscal_Integration]].


## Analitik ve Raporlama
Satış modülü, ürün bazlı detaylı analitikler sunar.
- **Ürün Analitiği:** Belirli bir tarih aralığı ve şube bazında tüm ürünlerin satış adetlerini ve cirolarını hesaplar.
- **Trend Analizi:** En çok satan ilk 5 ürün için günlük satış eğilimlerini takip eder.
- **API:** `GET /dashboard/product-analytics/` (Dashboard selector'ları üzerinden beslenir).

## İptaller ve İadeler (2026-05-27)

Satış ekranındaki **İptaller & iadeler** sekmesi; iptal edilen sipariş kalemlerini ve soft-delete edilmiş satışlara bağlı iade satırlarını listeler.

### Veri kaynağı
| Kayıt tipi | Koşul | Tarih alanı |
|------------|--------|-------------|
| `CANCELLATION` | `OrderItem.status = CANCELLED` (ana kalem) | `updated_at` |
| `RETURN` | `OrderItem.status = COMPLETED` ve `order.sale.is_deleted = True` | `sale.deleted_at` |

İptal eden kullanıcı: öncelik `AuditLog` (`order_item.cancelled` → `order.cancelled`); iade satırlarında yedek olarak satışı oluşturan kullanıcı.

### Selector
- `backend/apps/sales/cancellation_selectors.py` — `get_cancellations_queryset`, `resolve_cancellation_actors`, toplam hesaplama.

### API (RBAC: `sales.view_sale` veya `sales.manage_sale`)
| Endpoint | Açıklama |
|----------|----------|
| `GET /sales/cancellations/` | Sayfalı liste (`page`, `page_size=200`), `totals` |
| `GET /sales/cancellations/export/excel/` | Excel raporu (max 5000 satır) |
| `GET /sales/cancellations/export/pdf/` | PDF raporu (max 1000 satır) |

**Query parametreleri:** `branch_id`, `start_date`, `end_date`, `product_id`, `search` — şube kapsamı `branch_filter_qs` ile uygulanır.

### Yanıt alanları (özet)
`tarih`, `masa`, `iptal_eden`, `neden` (`cancel_reason_code` / `cancel_reason_text`), `ürün`, `miktar`, `birim/total fiyat`, `record_type`.

Frontend detay: [[Frontend_Sales]].
