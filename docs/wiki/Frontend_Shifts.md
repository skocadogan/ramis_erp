# Frontend Shifts

> **Özet:** Vardiya açma/kapama, kasa mutabakatı, gider ve nakit hareketi ekranları. Kasa Raporu (cihaz bazlı satış detayı) özelliği ve PDF dışa aktarımı içerir.
> **Kütüphaneler:** React, TanStack Query, Sonner, Lucide
> **Bağlantılar:** [[Shifts]], [[Frontend_Architecture]], [[Reporting]]

---

## Konum
- **Sayfa:** `frontend/src/app/shifts/`
- **Feature:** `frontend/src/features/shifts/`

## Tipler
`frontend/src/features/shifts/types.ts` — Vardiya TypeScript tipleri.

Yeni tip: `ShiftCashReportDto` — Kasa Raporu veri yapısı:

```typescript
interface ShiftCashReportDto {
  shift: { opened_at: string; closed_at: string | null; opened_by_name: string; branch_name: string };
  totals: { gross_sales: number; total_discount: number; total_cancelled: number; sale_count: number };
  payment_breakdown: { CASH: number; CARD: number; OTHER: number };
  terminals: Array<{
    terminal_name: string;
    sales_count: number;
    total_amount: number;
    payments: { CASH: number; CARD: number; OTHER: number };
    sales_list: Array<{ id: string; order_number: number; paid_at: string; created_by: string; payment_method: string; discount_amount: number; total_amount: number }>;
  }>;
}
```

---

## CashReportDialog — Kasa Raporu Diyaloğu

**Konum:** `frontend/src/features/shifts/components/CashReportDialog.tsx`

Vardiya ekranındaki "Kasa Raporu" aksiyonundan açılır. `ShiftCashReportDto` verisini görsel olarak sunar:

| Bölüm | İçerik |
|-------|--------|
| Vardiya Bilgileri | Açılış/kapanış tarihi, kasiyer, şube |
| Özet Kartları | Brüt Satış, Toplam İndirim, Toplam İptal |
| Ödeme Türü Dağılımı | Nakit / Kredi Kartı / Diğer |
| Cihaz Bazlı Detay | Her terminal için satış tablosu (sipariş no, tarih, kasiyer, yöntem, indirim, tutar) |

### PDF Dışa Aktarımı
"PDF Rapor Al" butonu `adminApi.generateModuleReport('cash-report', { shift_id })` çağırır. Blob olarak indirilir, dosya adı `kasa-raporu-{shiftId[0..8]}.pdf` biçimindedir.

`useCanViewAmounts` hook'u ile tutar alanları için görünürlük kontrolü uygulanır (maskeleme desteği).

---

## API Servisi
`frontend/src/features/shifts/services/shiftsApi.ts` — `/shifts/cash-report/?shift_id=...` uç noktasına GET isteği atar ve `ShiftCashReportDto` döner.
