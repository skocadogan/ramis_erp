# Frontend Error Handling — Hata Yönetimi

- **Özet:** Frontend'de API hata ayrıştırma, operasyonel bildirimler, toast politikası ve HTTP hata sınıfı altyapısını kapsar. DRF hata formatlarını ayrıştırır, üretim/geliştirme ortamlarında farklı bildirim davranışları sunar.
- **Kütüphaneler:** Axios, Sonner (toast), React
- **Bağlantılar:** [[API_Client]], [[API_Responses]], [[Frontend_Architecture]]

---

## 1. API Hata Ayrıştırıcı (`parseApiError.ts`)

DRF yanıt gövdesinden hata mesajını çıkartır.

```typescript
import { parseApiError } from "@/lib/parseApiError";

try {
  await apiPost("/orders/", data);
} catch (err) {
  const message = parseApiError(err);
  // → "Stok yetersiz: Domates" veya "Bilinmeyen hata"
}
```

### Ayrıştırma Sırası

1. `response.data.detail` (string)
2. `response.data.error` (string)
3. `response.data` alan bazlı hatalar (object → birleştirilir)
4. Axios hata mesajı
5. Genel fallback

---

## 2. Operasyonel Toast (`operationalToast.ts`)

Üretim ortamı için güvenli toast yardımcıları.

```typescript
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast";

toastApiSuccess("Sipariş oluşturuldu");
toastApiError(error);  // parseApiError + toast.error
```

API interceptor'daki dev-only toast'lardan farklı olarak bu fonksiyonlar her ortamda çalışır ve açıkça çağrılır.

---

## 3. Toast Politikası (`apiToastPolicy.ts`)

API interceptor'un otomatik toast gösterip göstermeyeceğini kontrol eder.

| Ortam | Varsayılan | Açıklama |
|-------|------------|----------|
| Geliştirme | Açık | 4xx/5xx → otomatik toast |
| Üretim | Kapalı | Runtime config ile değiştirilebilir |

### İstek Bazlı Atlatma

```typescript
await api.post("/endpoint/", data, { skipApiToast: true });
// → Bu istek için otomatik hata toast'ı gösterilmez
```

---

## 4. HTTP Hata Sınıfı (`lib/http/client.ts`)

Tipli API wrapper'lar ve `HttpError` sınıfı.

```typescript
import { apiGet, apiPost, HttpError } from "@/lib/http";

try {
  const result = await apiGet<OrderList>("/orders/");
} catch (err) {
  if (err instanceof HttpError) {
    console.log(err.status);  // 404
    console.log(err.data);    // DRF yanıt gövdesi
  }
}
```

### Tipli API Fonksiyonları

| Fonksiyon | Açıklama |
|-----------|----------|
| `apiGet<T>(url)` | GET isteği → `T` döner |
| `apiPost<T>(url, data)` | POST isteği |
| `apiPut<T>(url, data)` | PUT isteği |
| `apiPatch<T>(url, data)` | PATCH isteği |
| `apiDelete<T>(url)` | DELETE isteği |

---

## 5. 404 Sayfası (`not-found.tsx`)

Özel 404 hata sayfası. `SearchX` ikonu, başlık, geri düğmesi ve ana sayfa bağlantısı.
Metinler `common.notFound` anahtarı ile `next-intl` üzerinden yönetilir (tr/en/bg/sq).

---

## Kaynak Dosyalar

- [`parseApiError.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/parseApiError.ts)
- [`operationalToast.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/operationalToast.ts)
- [`apiToastPolicy.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/apiToastPolicy.ts)
- [`api-utils.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/api-utils.ts)
- [`client.ts`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/lib/http/client.ts)
- [`not-found.tsx`](file:///home/sedat/pyProjects/ramis_erp/frontend/src/app/not-found.tsx)
