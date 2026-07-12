# Müşteriler Modülü (Customers Module)

> **Özet:** Müşteriler modülü, Ramis ERP içerisinde bireysel ve kurumsal müşterilerin bilgilerini tutmak, satış geçmişlerini takip etmek, Excel/PDF raporları indirmek ve POS sipariş tamamlama aşamasında aktif siparişe müşteri atamak amacıyla geliştirilmiş uçtan uca modüldür.
> **Kütüphaneler:** Django 6 REST Framework, Next.js 16 (React 19), Axios, Recharts, TanStack Query.
> **Bağlantılar:** [[Index]], [[BaseModel]], [[Sales]], [[Frontend_POS]], [[Reporting]].

---

## 🏗️ Backend Mimarisi

### Veri Modeli (`apps/customers/models.py`)
Müşteri verileri `BaseModel`'den türetilmiştir ve merkezi `is_active=False` soft-delete mekanizmasına tabidir.
* **Müşteri Tipi (`customer_type`)**: `INDIVIDUAL` (Bireysel) veya `CORPORATE` (Kurumsal) olarak seçilir.
* **Bireysel Alanlar**: T.C. Kimlik Numarası (`tc_no`).
* **Kurumsal Alanlar**: Vergi Dairesi (`tax_office`), Vergi Numarası (`tax_no`), Mersis Numarası (`mersis_no`), Web Adresi (`web_address`).
* **Ortak Alanlar**: İsim/Firma Unvanı (`name`), Telefon (`phone`), E-posta (`email`), Adres (`address`).
* **İlişkiler**: `Order` modeli üzerinde `customer = ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)` tanımlanarak siparişe müşteri bağlanır.

### Seri Hale Getiriciler & Görünümler (`apps/customers/serializers.py` & `views.py`)
* `CustomerSerializer` CRUD işlemleri için kullanılır.
* `/api/v1/customers/{id}/detail_sales/` endpoint'i, müşteriye ait satış geçmişini sayfalanmış olarak çeker ve brüt ciro, toplam indirim ve net tahsilat toplamlarını hesaplayıp `totals` nesnesi altında döner.

### Raporlama Altyapısı (`apps/customers/reports.py` & `templates`)
* **Excel Raporlama**: Pandas veya Openpyxl kullanılarak müşteri listesi ve müşteri satış detayları Excel formatında dışa aktarılır.
* **PDF Raporlama**: HTML şablonları (`customer_list.html` ve `customer_sales_detail.html`) Weasyprint motoruyla PDF'e dönüştürülür. 
  * Şablonlardaki Django model metot çağrıları (örn. `sale.get_payment_method_display()`) Weasyprint şablon motorunda parantezli çağrılarak ödeme yöntemi etiketlerinin doğru basılması güvence altına alınmıştır.

---

## 🎨 Frontend Mimarisi

### API Servisi (`features/customers/services/customersApi.ts`)
* Axios istemcisi `api` üzerinden JWT kimlik doğrulama başlığı taşınarak backend ile haberleşilir.
* Güvenli dosya indirme işlemleri için `responseType: "blob"` seçeneğini kullanan Axios çağrıları tanımlanmıştır:
  * `exportExcel()`: Müşteri listesi Excel çıktısını indirir.
  * `exportPdf()`: Müşteri listesi PDF çıktısını indirir.
  * `exportCustomerSalesExcel(id)`: Müşteri satış geçmişi Excel çıktısını indirir.
  * `exportCustomerSalesPdf(id)`: Müşteri satış geçmişi PDF çıktısını indirir.

### Bileşenler (`features/customers/components/`)
* **`CustomersTable.tsx`**: Müşteri listesi, arama, filtreleme, indirme (blob formatlı) ve CRUD tetiklemelerini barındıran ana tablo bileşenidir. Dark modda beyaz kalma sorunları giderilerek standart Tailwind `slate-800` renklerine uyarlanmıştır.
* **`CustomerModal.tsx`**: Bireysel/Kurumsal müşteri ekleme/güncelleme formunu barındırır.
* **`CustomerDetailModal.tsx`**: Müşteri profili ve satış geçmişi dökümünü listeler. Satış numaralarına tıklandığında sipariş detaylarını içeren bir popup modal tetikler.
* **`CustomerSelectModal.tsx`**: POS ekranında aktif siparişe müşteri atamak için kullanılan hızlı müşteri arama ve seçme arayüzüdür.

---

## ⚡ POS (Sipariş Tamamlama) & Otomatik Not Entegrasyonu

* **Müşteri Atama**: POS sipariş tamamlama ekranında siparişe `CustomerSelectModal` üzerinden müşteri atanır. Backend tarafında ilgili siparişin `customer` alanı güncellenir.
* **Otomatik Satış Notu**: Sipariş kapatılırken `sale_helper.py` servisinde siparişe atanmış bir müşteri olup olmadığı kontrol edilir:
  * Eğer müşteri atanmışsa, backend localization dosyalarından çekilen `_("%(customer_name)s adına fiş düzenlendi.")` formatı kullanılarak Satış (`Sale`) kaydının **Notlar** kısmına otomatik not eklenir.
  * Bu notun İngilizce, Türkçe, Bulgarca ve Arnavutça dillerindeki çevirileri `django.po` dosyalarında tanımlanmış ve derlenmiştir.
  * Veresiye ödeme notları ile müşteri notları birleştirilerek kaydedilir.
