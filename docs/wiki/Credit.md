# Credit (Ödenmez / Müşteri Kredisi)

> **Özet:** Kayıtlı veya sanal müşteriler için şube kapsamlı ödenmez hesapları yönetir; kredi yükleme, harcama ve bakiye takibi yapar. POS satış kapanışında `CREDIT` ödeme yöntemi ile entegre çalışır.
> **Kütüphaneler:** Django ORM, Django REST Framework
> **Bağlantılar:** [[Sales]], [[Orders]], [[RBAC]], [[Reporting]], [[Branch_Scope]], [[Frontend_Credit]]

---

## Konum
`backend/apps/credit/`

## Modeller

### CreditAccount
| Alan | Tip | Açıklama |
|------|-----|----------|
| `user` | `FK → User` (opsiyonel) | Sistem kullanıcısı; kullanıcı başına tek aktif hesap |
| `first_name` / `last_name` | `CharField` | Sanal kişi adı |
| `branch` | `FK → Branch` | Şube kapsamı (`is_global=True` ise null) |
| `is_global` | `BooleanField` | Tüm şubelerde kullanılabilir |
| `credit_policy` | `TextChoices` | `BLOCK` / `WARN_ALLOW` / `OPEN_TAB` |

### CreditTransaction
| Alan | Tip | Açıklama |
|------|-----|----------|
| `account` | `FK → CreditAccount` | Hesap |
| `transaction_type` | `TOPUP` / `CHARGE` | Yükleme veya harcama |
| `amount` | `DecimalField` | Daima pozitif |
| `sale` | `FK → Sale` (opsiyonel) | CHARGE satış bağlantısı |
| `branch` | `FK → Branch` | İşlem şubesi |

**Bakiye:** `SUM(TOPUP) - SUM(CHARGE)`; iptal/silinmiş satışa bağlı CHARGE hareketleri bakiyeden düşülmez.

## Servisler (`services.py`)
- `CreditService.create_account` / `update_account` / `delete_account` (soft-delete)
- `CreditService.topup` — kredi yükleme
- `CreditService.validate_charge` — politika kontrolü
- `CreditService.apply_charges_for_sale` — satış kapanışında harcama kaydı

## API
| Endpoint | Açıklama |
|----------|----------|
| `GET/POST /api/v1/credit/accounts/` | Liste / oluştur |
| `PATCH/DELETE /api/v1/credit/accounts/{id}/` | Güncelle / sil |
| `POST /api/v1/credit/accounts/{id}/topup/` | Kredi yükle |
| `GET /api/v1/credit/accounts/{id}/transactions/` | Ekstre |
| `GET /api/v1/credit/accounts/pos-available/?branch_id=` | POS hesap listesi |

## RBAC
- `credit.view_account` — listeleme, POS hesap seçimi
- `credit.manage_account` — CRUD, topup, politika

## Raporlama
Modül raporu: `credit-account-statement` (PDF/Excel) — `apps/credit/reports/credit_reports.py`

## Satış entegrasyonu
- `PaymentMethod.CREDIT` — [[Sales]] modelinde ödeme yöntemi
- Özet/Z/Kasa raporlarında aggregation: `CREDIT → OTHER` (`payment_utils.aggregation_bucket`)
- Terminal kırılımında `payments.CREDIT` ayrı satır
- Satış notu: `"<ad> <soyad> hesabından karşılandı."`
