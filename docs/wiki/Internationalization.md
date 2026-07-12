# Internationalization (Uluslararasılaştırma)

> **Özet:** Ramis ERP, `next-intl` kütüphanesini kullanarak çoklu dil (TR/EN) desteği sağlar.
> **Kütüphaneler:** next-intl
> **Dizin:** `frontend/src/i18n/`

---

## Genel Bakış

Uygulama, hem kullanıcı arayüzü metinlerini hem de tarih/sayı formatlarını yerel ayarlara göre dinamik olarak sunar. Şu an desteklenen diller:
- **Türkçe (tr)** — Varsayılan
- **İngilizce (en)**

## Dosya Yapısı

Çeviri dosyaları JSON formatında `frontend/src/i18n/messages/` dizini altında toplanmıştır. Her dil için modüler dosyalar bulunur:

- `admin.json`: Yönetim paneli sekmeleri, ayarlar ve raporlar.
- `pos.json`: POS satış ekranı, müşteri ekranı ve POS özel ayarları (`product.caloriesValue`, `display.caloriesValue`).
- `menu_management.json`: Menü yönetimi formu (`productForm.calories`, `productForm.caloriesPlaceholder`).
- `kds.json`: Mutfak gösterim sistemi.
- `tables.json`: Masa yönetimi, hesap modalı, indirimler ve transfer işlemleri.
- `waiter.json`: Garson ekranına özel vardiya, sepet ve rezervasyon onay metinleri.
- `common.json`: Ortak kullanılan butonlar, mesajlar ve UI terimleri.
- ...diğer modül dosyaları.

## Kullanım Standartları

### 1. Bileşen İçinde Kullanım
Bileşenlerde `useTranslations` kancası kullanılır.

```tsx
import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations('admin'); // 'admin' namespace'i
  
  return <h1>{t('users.title')}</h1>;
}
```

### 2. Parametreli Çeviriler
Dinamik değerler için interpolasyon kullanılır.

```json
// JSON tarafı
"deleteConfirm": "{name} kaydı silinsin mi?"

// Kod tarafı
t('deleteConfirm', { name: item.name })
```

### 3. Namespace Stratejisi
Karmaşayı önlemek için her büyük modül kendi namespace'ine sahiptir.
- **Admin Paneli:** `admin` namespace'ini kullanır.
- **POS Ayarları:** Yönetim panelinde olsa dahi `pos` namespace'ini (veya `pos` içindeki `admin_settings` bölümünü) kullanır.
- **Ortak Kontroller:** `common` namespace'i altındaki anahtarlar (Örn: `save`, `cancel`, `loading`) tüm uygulamada standarttır.

## Uygulanan Modüller

- **Yönetim Paneli (Admin):** Tüm sekmeler ve kullanıcı yönetimi tamamen yerelleştirilmiştir.
- **POS & KDS:** Satış ve mutfak ekranları yüksek oranda yerelleştirilmiştir.
- **Masa Yönetimi (Tables):** Hesap detayı, ödeme akışı ve bölge yönetimi tam TR/EN desteğine sahiptir.
- **Garson (Waiter):** Garson spesifik tüm akışlar yerelleştirilmiştir.
- **Tarih & Sayı:** `Intl` API'si ve Next.js middleware üzerinden otomatik locale tespiti yapılır.

## Dil Değiştirme (Language Switcher)

Uygulamanın farklı bölümlerinde dil değiştirme özelliği bulunur:
- **Admin Paneli:** Sidebar alt kısmında.
- **POS & Garson Ekranı:** Header alanında, tema menüsünün yanında.

Dil değişimi sırasında:
1. `NEXT_LOCALE` çerezi güncellenir.
2. Backend'e `preferred_language` yaması (patch) gönderilir.
3. Sayfa yenilenerek yeni dil paketleri yüklenir.

## Backend ve Veritabanı Seeding Yerelleştirmesi

Uygulamanın temel yetki ve rol yapısı da çok dilli desteğe sahiptir:

- **Seeding:** `python manage.py seed_rbac --lang tr|en` komutu ile veritabanındaki RBAC kayıtları (Kategoriler, İzinler, Roller) seçilen dilde oluşturulur.
- **İzin açıklamaları:** `python manage.py seed_rbac --lang tr|en --update` yalnızca mevcut `RolePermission` satırlarının `description` alanını günceller (ID ve izin kodları değişmez). `seed_rbac.py` içindeki izin sözlüklerine isteğe bağlı `description_tr` / `description_en` eklenebilir; yoksa güncellemede ilgili dildeki izin adı (`name_tr` / `name_en`) kullanılır.
- **Kurulum:** `install.sh` sihirbazı kurulumun başında dil tercihini sorar ve tüm başlangıç verilerini bu tercihe göre yapılandırır.
- **Güncelleme:** `update.sh --reload-roles --lang tr|en` komutu ile mevcut roller istenilen dile hızlıca çevrilebilir.
- **Güncellenebilirlik:** Eğer sistem daha önce kurulmuşsa, farklı bir dilde `seed_rbac` komutu çalıştırılarak mevcut kayıtların isim ve açıklamaları anında güncellenebilir.

## Sistem Araçları (System Utils) Yerelleştirmesi

Masaüstü ve terminal tabanlı sistem araçları (`ramis_monitor`, `user_emergency` vb.) için merkezi bir dil yönetim yapısı kullanılır:

- **Merkezi Ayar:** Dil tercihi `/etc/ramis/lang` dosyasında (örn: `en` veya `tr`) saklanır. Bu dosya `install.sh` ve `update.sh` tarafından otomatik güncellenir.
- **Dinamik Arayüz:** Python tabanlı araçlar açılışta bu dosyayı okur ve dahili `TRANSLATIONS` sözlüğü üzerinden arayüzü seçilen dile çevirir.
- **Taşınabilirlik:** Araçlar, harici çeviri dosyalarına ihtiyaç duymadan (standalone) çalışabilecek şekilde tasarlanmıştır.

## Sorun Giderme

- **MISSING_MESSAGE Hatası:** Eğer konsolda bu hatayı görürseniz, ilgili anahtar `tr.json` veya `en.json` dosyalarından birinde eksik veya hatalı yazılmış demektir. Anahtar isimlerinin (case-sensitivity) her iki dosyada da birebir aynı olması zorunludur.
- **TypeScript Fallback:** Tip güvenliği hatalarını (`string | undefined`) önlemek için interpolasyonlarda `t('key', { val: x || "" })` şeklinde fallback kullanılması önerilir.

## Yeni Bir Dil Ekleme (Rehber)

Sisteme yeni bir dil (Örn: İtalyanca - `it`) eklemek için şu adımları izleyin:

### 1. Backend (RBAC ve Seed Verileri)
- **`seed_rbac.py`**: `SUPPORTED_LANGS` listesine yeni dili ekleyin. `CATEGORIES`, `PERMISSIONS` ve `ROLES` sözlüklerine çevirileri girin.
- **`seed_full.py`**: `ROLE_NAMES` sözlüğüne yeni dildeki rol karşılıklarını ekleyin.

### 2. Django Sabit Metinleri (PO/MO Dosyaları)
Kod içerisindeki sabit metinlerin (hata mesajları, form uyarıları vb.) çevirisi için:
- **Ayarlar:** `backend/config/settings.py` içindeki `LANGUAGES` listesine yeni dili ekleyin.
- **Dosya Oluşturma:** `backend` dizininde `python manage.py makemessages -l it` komutunu çalıştırın.
- **Çeviri:** `backend/locale/it/LC_MESSAGES/django.po` dosyasını düzenleyin.
- **Derleme:** `python manage.py compilemessages` komutu ile `.mo` dosyasını oluşturun.

### 3. Sistem Araçları (System Utils)
- `ramis_monitor.py` ve `ramis_user_admin.py` dosyalarındaki `TRANSLATIONS` sözlüğüne yeni dil anahtarını ve çevirilerini ekleyin.

### 4. Kurulum Betikleri
- **`install.sh`**: `interactive_wizard()` fonksiyonundaki dil seçim menüsüne yeni seçeneği ekleyin.

### 5. Frontend
- `frontend/src/i18n/messages/` dizinine yeni dil için JSON dosyalarını (örn: `it.json`) oluşturun veya kopyalayın.
- `next-intl` konfigürasyonuna yeni dili dahil edin.

### 6. Uygulama
Değişiklikleri uygulamak için:
```bash
sudo bash update.sh --reload-roles --lang it
```
