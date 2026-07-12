# Frontend Credit (Ödenmez Yönetimi)

> **Özet:** `/credit` sayfasında ödenmez hesaplarını listeler, oluşturur ve detay/ekstre yönetimi sunar. POS masa ödeme modalında `CreditPaymentModal` ile hesap seçimi yapılır.
> **Kütüphaneler:** Next.js App Router, React 19, TanStack Query, next-intl
> **Bağlantılar:** [[Credit]], [[Frontend_Tables]], [[Frontend_Sales]], [[Frontend_Shifts]], [[API_Client]], [[RBAC]]

---

## Konum
- Sayfa: `frontend/src/app/credit/page.tsx`
- Feature: `frontend/src/features/credit/`
- i18n: `frontend/src/i18n/messages/{tr,en}/credit.json`

## Bileşenler
| Bileşen | Rol |
|---------|-----|
| `CreditAccountList` | Hesap tablosu, silme |
| `CreditAccountFormModal` | Oluştur/güncelle (sanal kişi veya kullanıcı) |
| `CreditAccountDetailModal` | Bakiye, topup, hareketler, PDF/Excel export |
| `CreditPaymentModal` | POS ödeme sırasında hesap seçimi |

## POS entegrasyonu
- `TableOrderModal` → `OrderFooter` Ödenmez butonu
- Ödeme payload: `{ method: "CREDIT", amount, credit_account_id }`
- Müşteri ekranı: `CustomerDisplayView` CREDIT etiketi

## Navigasyon
Sidebar: Wallet ikonu, RBAC grubu `credit` (`MODULE_PERMISSIONS`)

## API katmanı
`features/credit/services/creditApi.ts` — ortak axios istemcisi (`@/lib/api`)
