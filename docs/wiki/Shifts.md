# Shifts (Vardiya Yönetimi)

> **Özet:** Kasa vardiya açma/kapama, nakit-kart-diğer ödeme mutabakatı, vardiya giderleri ve nakit hareketleri. POS terminali ile entegredir.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Branches]], [[Sales]], [[Users]], [[POS_Display]]

---

## Konum
`backend/apps/shifts/`

## Modeller

### Shift
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `opened_by/closed_by` | `FK → User` | Açan/kapatan |
| `status` | `TextChoices` | OPEN / CLOSED |
| `opened_at/closed_at` | `DateTimeField` | Zaman damgaları |
| `opened_at_terminal` | `FK → PosTerminal` | Açıldığı terminal |
| `opening_cash` | `Decimal` | Açılış kasası |
| `expected_cash/actual_cash/difference` | `Decimal` | Nakit mutabakat |
| `expected_card/actual_card/difference_card` | `Decimal` | Kart mutabakat |
| `expected_other/actual_other/difference_other` | `Decimal` | Diğer mutabakat |

### ShiftExpense
Vardiya süresince yapılan giderler.

### ShiftCashMovement
Kasa nakit giriş/çıkış hareketleri (IN/OUT).

---

## Raporlar (`backend/apps/shifts/reports/shift_reports.py`)

[[Reporting]] altyapısı üzerine inşa edilmiş üç rapor kaydedilmiştir:

| Slug | Sınıf | Açıklama |
|------|-------|----------|
| `z-report` | `ZReport` | Vardiya sonu özeti (satış, ödeme, kasa mutabakatı) |
| `cash-report` | `CashReport` | Cihaz bazlı satış, iptal, indirim ve ödeme türü detayları |
| `shift-list` | `ShiftListReport` | Tarih/terminal filtrelenmiş vardiya listesi |

### `CashReport` — Kasa Raporu

Selector: `get_shift_cash_report(shift_id)` (`apps/shifts/selectors.py`)

Döndürdüğü yapı:

```python
{
  "shift": { opened_at, closed_at, opened_by_name, branch_name },
  "totals": { gross_sales, total_discount, total_cancelled, sale_count },
  "payment_breakdown": { CASH, CARD, OTHER },
  "terminals": [
    {
      "terminal_name": str,
      "sales_count": int,
      "total_amount": Decimal,
      "payments": { CASH, CARD, OTHER },
      "sales_list": [ { id, order_number, paid_at, created_by, payment_method, discount_amount, total_amount } ]
    }
  ]
}
```

Şablon: `backend/apps/shifts/templates/reports/cash_report.html`

Frontend arayüzü için bkz. [[Frontend_Shifts]].
