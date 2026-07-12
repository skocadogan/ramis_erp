# Gate POS Kapısı — Ana Sayfa Düğmesi

> **Özet:** POS ve garson ekranlarında vardiya kapalı, POS terminali seçimi veya şubede aktif terminal yok gibi durumlarda tam ekran kapı görünümünde kullanıcıyı yönetim paneline (`/panel`) döndüren ortak bağlantı bileşenidir.
> **Kütüphaneler:** React, Next.js `Link`, Lucide `Home`, Tailwind
> **Bağlantılar:** [[Frontend_POS]], [[Frontend_Waiter]], [[Shifts]], [[Frontend_Architecture]]

---

## Konum
- `frontend/src/features/pos/components/GateHomeButton.tsx`

## Kullanım Yerleri
- **[[Frontend_POS]]** — `app/pos/page.tsx` içinde: aktif POS yok, ödeme noktası seçimi, açık vardiya yok / vardiya açma ekranı.
- **[[Frontend_Waiter]]** — `app/waiter/page.tsx` içinde: kasa kapalı (açık vardiya yok) uyarı ekranı.

Hedef rota: **`/panel`** ([[Frontend_Architecture]] üst barı ile aynı).
