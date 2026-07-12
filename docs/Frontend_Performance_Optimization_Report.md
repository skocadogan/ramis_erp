# 🚀 Ramis ERP — Frontend Performans Optimizasyon Raporu

> **Hedef:** Kullanıcının hissedeceği gerçek performans artışı.  
> **Prensip:** Projeyi patlatmayacak, geri dönüşü kolay, ölçülebilir iyileştirmeler.  
> **Tarih:** 2026-07-08  
> **Kapsam:** Frontend (Next.js 16 / React 19)

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Darboğaz Tespit Metodolojisi](#2-darboğaz-tezpit-metodolojisi)
3. [P0 — Kritik: Hemen Yapılacaklar](#3-p0--kritik-hemen-yapılacaklar)
4. [P1 — Yüksek Öncelik: Bu Sprint](#4-p1--yüksek-öncelik-bu-sprint)
5. [P2 — Orta Öncelik: Önümüzdeki Sprint](#5-p2--orta-öncelik-önümüzdeki-sprint)
6. [P3 — Düşük Öncelik: Arka Plan](#6-p3--düşük-öncelik-arka-plan)
7. [YAPILMAMASI Gerekenler](#7-yapılmaması-gerekenler)
8. [Etki/Zahmet Matrisi](#8-etkizahmet-matrisi)
9. [Ölçüm ve Doğrulama Planı](#9-ölçüm-ve-doğrulama-planı)
10. [Ek: Kod Örnekleri](#10-ek-kod-örnekleri)

---

## 1. Yönetici Özeti

### Mevcut Durum

| Metrik | Değer |
|---|---|
| Frontend source files | 612 (375 `.tsx` + 237 `.ts`) |
| Feature modülü | 24 adet |
| `useEffect` sayısı | 282 (155 dosyada) |
| `React.memo` kullanımı | **Sadece 3 bileşen** |
| `useQuery` / `useMutation` | 83 / 93 (iyi kullanım) |
| Dynamic import | 90+ nokta (iyi) |
| Client bundle | ~9.3 MB (gzip ~1.5 MB) |
| WebSocket bağlantısı | 5-6 / POS sayfası |

### En Kritik 3 Bulgu

| # | Bulgu | Etki | Düzeltme Süresi |
|---|---|---|---|
| 1 | **POS'ta çift state (Query + Zustand sync)** | Her query sonucu 2 cache'te, 2 re-render | ⏱ ~4 saat |
| 2 | **React.memo sadece 3 bileşende** | POS sayfasında her store değişiminde tüm ağaç render | ⏱ ~2 saat |
| 3 | **KDS'de zorla 60sn re-render** | Hiçbir olay olmasa bile tüm KDS sayfası yeniden render | ⏱ ~15 dakika |

> **Tahmini Toplam Kazanç:** POS sayfasında re-render sayısında **%40-60 azalma**,  
> KDS sayfasında gereksiz HTTP isteklerinde **%50 azalma**,  
> Kullanıcı algısında belirgin akıcılık artışı.

---

## 2. Darboğaz Tespit Metodolojisi

Analiz şu yöntemlerle yapılmıştır:

1. **Kod tabanı taraması:** 612 dosyada useEffect, useMemo, React.memo, key={index} pattern'leri
2. **Bundle analizi:** next.config.ts optimizePackageImports, node_modules boyutları, .next çıktısı
3. **WebSocket trafiği:** Backend broadcast pattern'leri, frontend state güncelleme stratejileri
4. **Veri akışı:** React Query → Zustand sync zinciri, cache invalidation pattern'leri
5. **Render zinciri:** POS sayfasında store değişimi → bileşen ağacı yayılımı

---

## 3. P0 — Kritik: Hemen Yapılacaklar

Bu maddeler ya çok düşük riskli ya da gözle görülür etkisi olan optimizasyonlardır.

---

### 3.1 ❗ KDS StationDisplayScreen Zorla Re-render

**Dosya:** `frontend/src/features/kds/components/StationDisplayScreen.tsx`  
**Satır:** ~161  
**Kod:**
```tsx
// BUG: Her 60 saniyede bir tüm bileşen ağacını gereksiz yere re-render eder
useEffect(() => {
  const id = setInterval(() => setTasks((prev) => [...prev]), 60_000);
  return () => clearInterval(id);
}, []);
```

**Sorun:** Bu interval'in tek amacı "zaman göstergesini güncellemek" olsa gerek. Ama tüm `tasks` state'inin referansını değiştirerek **tüm KDS sayfasını** yeniden render ettiriyor. Hiçbir WS olayı olmasa bile her 60 saniyede bir gereksiz render döngüsü.

**Çözüm:** Zaman gösterimi için ayrı bir `LiveClock` component'i kullanılmalı, task listesi etkilenmemeli:

```tsx
// ✅ Doğru: Sadece saat bileşeni interval kullanır
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span>{format(now, "HH:mm")}</span>;
}

// StationDisplayScreen'den interval TAMAMEN KALDIRILIR
```

**Etki:** KDS sayfasında her 60 saniyede bir olan gereksiz full re-render **tamamen biter**.  
**Risk:** Çok düşük. Sadece saat formatının güncellenme şekli değişir.  
**Süre:** ~15 dakika

---

### 3.2 ❗ POS Veri Akışında Çift Cache (Query + Zustand)

**Dosya:** `frontend/src/features/pos/hooks/usePosDataSync.ts`  
**Sorun:** React Query ile veri çekildikten sonra her sonuç `useEffect` ile Zustand store'a kopyalanıyor:

```
React Query (branches) → useEffect → Zustand.setBranches()
React Query (tables)   → useEffect → Zustand.setTables()  
React Query (products) → useEffect → Zustand.setProducts()
...
```

Bu şu anlama gelir:
- Aynı veri **2 kere** bellekte (Query Cache + Zustand)
- Her query güncellemesi **2 re-render zinciri** (önce Query aboneleri, sonra Zustand aboneleri)
- Garbage collection tutarsızlığı (Query cache temizlenince Zustand state temizlenmiyor)

**Çözüm (Aşamalı):**

**Aşama 1 — Selector migration:** Bileşenleri Zustand'dan doğrudan React Query'ye geçir:

```tsx
// ❌ Şu anki: Zustand'dan oku
const tables = usePosStore((s) => s.tables);

// ✅ Yeni: React Query'den doğrudan oku
const { data: tables } = useQuery({
  queryKey: queryKeys.tables({ branchId }),
  queryFn: () => tablesApi.list({ branchId }),
  staleTime: 60_000,
});
```

**Aşama 2 — Sync efektlerini kaldır:** Tüm bileşenler React Query'ye geçtikten sonra `usePosDataSync.ts`'deki sync `useEffect`'leri ve Zustand store'daki veri alanlarını temizle.

**Aşama 3 — Sadece UI state kalana kadar:** Zustand'da sadece gerçek UI state'i (seçili masa, sepet içeriği, modal durumu) kalır.

**Geçiş stratejisi — Paralel çalışma:** Her iki kaynak da aynı anda çalışabilir. Bileşenler tek tek React Query'ye geçirilir, sync efektleri sonra kaldırılır. Proje çalışmaya devam eder.

```tsx
// Geçiş sırasında: useEffect hala sync yapıyor ama
// bileşenler Query'den okumaya başlıyor
// → Sorunsuz çalışır, çift render kalkar
```

**Önce hangi bileşenler geçirilmeli:**
1. `TableGrid` / `TableCard` — masa verisi (en sık değişen)
2. `MenuSection` / `ProductCard` — ürün/menü verisi
3. `CartSidebar` — sepet (zaten kendi state'i var)

**Etki:** POS sayfasında store değişiminden kaynaklanan re-render zinciri **yarıya iner**, bellek kullanımı azalır.  
**Risk:** Orta-düşük (aşamalı geçiş sayesinde)  
**Süre:** ~4 saat (aşama 1+2)

---

### 3.3 ❗ React.memo Eksikliği — POS Sayfası Re-render Zinciri

**Dosya:** `frontend/src/features/pos/` altındaki kritik bileşenler  
**Durum:** Projede sadece **3 bileşen** `React.memo` ile sarılı (`POSHeader`, `BranchSelector`, `NotificationButtons`)

**POS sayfasındaki re-render zinciri:**

```
usePosStore değişimi
  → POSHeader (memo ✅ — korunuyor)
  → TableGrid (memo ❌ — her zaman render)
    → TableCard (memo ❌)
  → MenuSection (memo ❌)
    → ProductCard (memo ❌)
  → CartSidebar (memo ❌)
    → CartItemRow (memo ❌)
```

**Çözüm:** Aşağıdaki bileşenlere `React.memo` eklenmeli:

```tsx
// frontend/src/features/pos/components/TableGrid.tsx
export const TableGrid = React.memo(function TableGrid({ 
  tables, 
  onTableClick,
  filter,
  branchId 
}: TableGridProps) {
  return (/* ... */);
});

// frontend/src/features/pos/components/CartSidebar/index.tsx
export const CartSidebar = React.memo(function CartSidebar() {
  return (/* ... */);
});

// Ayrıca: TableCard, MenuSection, ProductCard, CartItemRow
```

**Önemli:** `React.memo`'nun çalışması için prop'ların stabil olması gerekir. POSHeader'da olduğu gibi, callback'ler `useCallback` ile sarılmalı veya `useShallow` selector kullanılmalı.

```tsx
// ❌ Yanlış: Her render'da yeni callback
<TableGrid onTableClick={(id) => handleClick(id)} />

// ✅ Doğru: Stabil callback
const handleTableClick = useCallback((id: string) => {
  handleClick(id);
}, [handleClick]);
```

**Hedeflenecek bileşenler:**
| Bileşen | Dizin | Neden |
|---|---|---|
| `TableGrid` | `pos/components/TableGrid.tsx` | POS sayfasının çekirdeği |
| `TableCard` | `pos/components/TableCard.tsx` | Liste elemanı, çok sayıda |
| `MenuSection` | `pos/components/` | Kategori bazlı menü |
| `ProductCard` | `pos/components/` | Liste elemanı |
| `CartSidebar` | `pos/components/CartSidebar/` | Sepet paneli |
| `CartItemRow` | `pos/components/CartSidebar/` | Liste elemanı |

**Etki:** POS sayfasında gereksiz re-render'ların **%50-70'i engellenir**.  
**Risk:** Düşük (izole değişiklik, her bileşen bağımsız)  
**Süre:** ~2 saat

---

### 3.4 ❗ `@base-ui/react` Tree-Shake Edilmemiş

**Dosya:** `frontend/next.config.ts`  
**Sorun:** 19 MB'lık `@base-ui/react` paketi `optimizePackageImports` listesinde değil. Tüm paket bundle'a giriyor olabilir.

```tsx
// next.config.ts — optimizePackageImports güncellemesi
experimental: {
  optimizePackageImports: [
    "lucide-react",
    "recharts",
    "date-fns",
    "@base-ui/react",        // ✅ EKLE: 19 MB tree-shake edilsin
    // "@radix-ui/react-icons",  ❌ ÇIKAR: projede kullanılmıyor
    // "clsx",                   ❌ ÇIKAR: zaten ~1 KB
    // "tailwind-merge"          ❌ ÇIKAR: zaten ~2 KB
  ],
},
```

**Etki:** Production bundle'ında ~5-10 MB azalma (sadece kullanılan base-ui bileşenleri kalır).  
**Risk:** Yok (Next.js'in native özelliği)  
**Süre:** ~5 dakika

---

## 4. P1 — Yüksek Öncelik: Bu Sprint

---

### 4.1 ⚠️ KDS'de Full HTTP Refetch Yerine Selektif State Merge

**Dosya:** `frontend/src/features/kds/hooks/useKdsData.ts`  
**Sorun:** `orders_updated` ve `kds_refresh` WS olayları her geldiğinde **en az 2 HTTP isteği** (`fetchOrders` + `fetchStations`) tetikleniyor. Oysa `order_status_changed` olayı zaten selektif state merge yapıyor.

```typescript
// Şu anki: Her olayda full refetch
if (payload.type === "kds_refresh" || payload.type === "orders_updated") {
  setTimeout(() => {
    void fetchOrdersRef.current();    // HTTP GET
    void fetchStationsRef.current();  // HTTP GET
  }, refreshMs);
}
```

**Çözüm:** `kds_refresh` payload'u hangi order'ların değiştiğini içeriyorsa, sadece onları güncelle. Full refetch sadece gerçekten gerekliyse (örneğin WS bağlantısı koptuysa) yapılsın.

```typescript
// ✅ Yeni: Önce state merge dene, olmazsa refetch
if (payload.type === "orders_updated" && payload.order_ids) {
  setOrders((prev) => {
    const updated = [...prev];
    for (const update of payload.order_ids) {
      const idx = updated.findIndex((o) => o.id === update.id);
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], ...update.changes };
      } else {
        // Yeni order gelmiş olabilir, refetch gerekli
        return prev; // değişiklik yok, refetch fallback
      }
    }
    return updated;
  });
}
```

**Etki:** KDS'de HTTP isteklerinin **%50-70'i azalır**. WS üzerinden gelen güncellemeler direkt state'e yansır.  
**Risk:** Orta (state merge mantığı doğru kurulmalı)  
**Süre:** ~3 saat

---

### 4.2 ⚠️ Menu Modülünü React Query'ye Taşıma

**Dosya:** `frontend/src/features/menu-management/hooks/useMenuData.ts`  
**Sorun:** Menu modülü `useState` + manuel API çağrıları ile çalışıyor:
- Her mount'ta 4 API çağrısı (categories, products, stations, branches)
- Hiçbir caching/dedup yok
- Sayfa değişikliklerinde gereksiz re-fetch
- Mutasyon sonrası tüm veriyi manuel `fetchData()` ile yeniden çekiyor

```typescript
// ❌ Şu anki: Manuel state yönetimi
const [categories, setCategories] = useState<Category[]>([]);
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);

const fetchData = useCallback(async () => {
  setLoading(true);
  const [categoriesRes, productsRes] = await Promise.allSettled([
    menuApi.getCategories(),
    menuApi.getProducts(),
  ]);
  // ... manuel state set
  setLoading(false);
}, []);
```

**Çözüm:** `useQuery` + `useMutation` pattern'ine taşı:

```typescript
// ✅ Yeni: React Query ile
export function useMenuCategories(branchId?: number) {
  return useQuery({
    queryKey: queryKeys.menuCategories({ branchId }),
    queryFn: () => menuApi.getCategories({ branchId }),
    staleTime: 5 * 60 * 1000, // 5 dk — referans verisi
  });
}

export function useMenuProducts(filters?: ProductFilters) {
  return useQuery({
    queryKey: queryKeys.menuProducts(filters),
    queryFn: () => menuApi.getProducts(filters),
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: menuApi.createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuCategoriesBase });
    },
  });
}
```

**Etki:** Menu modülünde gereksiz API çağrılarının **%80'i biter**, sayfalar arası geçişler anında olur (cache'den).  
**Risk:** Orta (mevcut state kullanımı tamamen değişiyor, tüm bileşenler güncellenmeli)  
**Süre:** ~6 saat (tüm modül)

---

### 4.3 ⚠️ POS Sipariş Akışında Optimistic Update

**Dosya:** `frontend/src/features/pos/components/CartSidebar/`  
**Sorun:** POS'ta sipariş verildiğinde, UI'ın güncellenmesi için **server round-trip + cache invalidation + refetch** bekleniyor. Kötü ağ koşullarında bu 1-3 saniye sürebilir.

**Çözüm:** Sipariş oluşturma ve masa işlemleri için optimistic update eklenmeli:

```typescript
const createOrderMutation = useMutation({
  mutationFn: (payload: CreateOrderPayload) => ordersApi.create(payload),
  
  // ✅ Optimistic: UI'ı hemen güncelle
  onMutate: async (payload) => {
    // 1. Mevcut cache'i snapshot'la
    await qc.cancelQueries({ queryKey: queryKeys.tablesBase });
    const previousTables = qc.getQueriesData({ queryKey: queryKeys.tablesBase });
    
    // 2. Cache'i optimistic olarak güncelle
    qc.setQueriesData({ queryKey: queryKeys.tablesBase }, (old: any) => {
      // Masa durumunu "dolu" olarak işaretle
      return old.map((t: any) => 
        t.id === payload.table_id 
          ? { ...t, status: "occupied" }
          : t
      );
    });
    
    // 3. Rollback için snapshot'ı döndür
    return { previousTables };
  },
  
  // Hata durumunda rollback
  onError: (err, payload, context) => {
    if (context?.previousTables) {
      for (const [key, data] of context.previousTables) {
        qc.setQueryData(key, data);
      }
    }
  },
  
  // Başarılı: server verisi optimistic'i ezer
  onSettled: () => {
    qc.invalidateQueries({ queryKey: queryKeys.tablesBase });
  },
});
```

**Önce hangi işlemler:**
1. Sipariş oluşturma (en kritik kullanıcı etkileşimi)
2. Masa açma/kapama (sık yapılan işlem)
3. Masa rezervasyonu

**Etki:** POS sipariş akışında UI hissi **anlık** hale gelir. Kullanıcı beklediğini hissetmez.  
**Risk:** Orta (rollback mekanizması doğru kurulmalı)  
**Süre:** ~4 saat (3 işlem için)

---

## 5. P2 — Orta Öncelik: Önümüzdeki Sprint

---

### 5.1 WebSocket Mesaj Deduplication

**Dosya:** `frontend/src/features/kds/hooks/useKdsData.ts`  
**Sorun:** Aynı `order_id` için ardışık WS mesajları gelebiliyor. Frontend'de **hiçbir deduplication yok**. Her mesaj işleniyor.

**Çözüm:** Son N mesaj için Set tabanlı deduplication:

```typescript
// useKdsData.ts içinde
const processedMessagesRef = useRef<Set<string>>(new Set());

function processWsMessage(payload: WsMessage) {
  const msgId = `${payload.type}:${payload.data?.order_id || payload.data?.task_id}`;
  
  // Son 50 mesaj içinde varsa atla
  if (processedMessagesRef.current.has(msgId)) return;
  
  processedMessagesRef.current.add(msgId);
  if (processedMessagesRef.current.size > 50) {
    // Eski mesajları temizle
    const iterator = processedMessagesRef.current.values();
    const first = iterator.next().value;
    if (first) processedMessagesRef.current.delete(first);
  }
  
  // Mesajı işle...
}
```

**Etki:** Gereksiz state güncellemeleri ve re-render'lar azalır.  
**Risk:** Düşük  
**Süre:** ~1 saat

---

### 5.2 Virtual Table Scroll Optimizasyonu

**Dosya:** `frontend/src/components/ui/virtual-table.tsx`  
**Sorun:** Scroll throttling manuel `Date.now` kontrolü ile yapılıyor. `requestAnimationFrame` veya `IntersectionObserver` daha verimli olabilir.

```typescript
// ❌ Şu anki: Manuel throttle
const handleScroll = useCallback(
  throttle((e) => {
    const now = Date.now();
    if (now - lastScrollRef.current >= 100) {
      // scroll işle...
    }
  }, 50),
  []
);

// ✅ Yeni: TanStack Virtual'ın built-in onChange'i kullanılabilir
const virtualizer = useVirtualizer({
  count: data.length,
  getScrollElement: () => tableRef.current,
  estimateSize: () => rowHeight,
  overscan: 3,
  onChange: (virtualizer) => {
    // onChange her frame'de çağrılır, ayrı throttle gerekmez
    if (onEndReached && virtualizer.getTotalSize() - virtualizer.getScrollOffset() < 300) {
      onEndReached();
    }
  },
});
```

**Etki:** Virtual table scroll'u daha akıcı, CPU kullanımı daha düşük.  
**Risk:** Düşük  
**Süre:** ~1 saat

---

### 5.3 POS Sayfasında WS Bağlantı Sayısını Azaltma

**Dosya:** `frontend/src/features/pos/hooks/usePosDataSync.ts`  
**Sorun:** Bir POS sayfası **5-6 ayrı WebSocket bağlantısı** açıyor: pos-sync, kitchen-notifications, waiter-calls, menu-catalog, pos-display, staff-notifications.

Her bağlantının heartbeat (30sn), olası yeniden bağlanma trafiği ve memory footprint'i var.

**Çözüm:** POS sayfasının `kitchen-notifications` kanalına ihtiyacı var mı? POS'un mutfak detaylarına (`stock_low_alert`, `kds_stats_update`, `prep_updated`) ihtiyacı yoksa, bu bağlantı kapatılabilir.

```typescript
// usePosDataSync.ts
// POS için kitchen-notifications gereksiz olabilir
// Sadece KDS sayfası için gerekli
const subscribeKitchenWs = pathname?.startsWith("/kds") ?? false;
```

**Etki:** POS sayfası başına 1-2 daha az WS bağlantısı, daha az bellek ve CPU.  
**Risk:** Düşük (POS mutfak bildirimlerini kaçırırsa ne olur kontrol edilmeli)  
**Süre:** ~1 saat

---

## 6. P3 — Düşük Öncelik: Arka Plan

Bu maddeler "güzel olur" seviyesinde. Etkileri sınırlı, ama yapılması hâlâ faydalı.

| # | Optimizasyon | Neden Düşük? |
|---|---|---|
| 6.1 | **`CustomerDisplayIdle` CSS background-image → next/image** | Sadece 1 bileşende, POS teşhir ekranında |
| 6.2 | **PWA ikon boyutlarını küçült (1376×768 → gerçek 192/512)** | Sadece PWA kurulum anında |
| 6.3 | **`useInventoryActions` string literal key → `queryKeys`** | Kod kalitesi, performans etkisi yok |
| 6.4 | **`key={index}` → stable ID** (`ProductFormModal.tsx`) | Sadece 3 yerde, risk düşük |
| 6.5 | **`refetchOnMount: "always"` kaldır** | 14 yerde, caching bypass ediyor |
| 6.6 | **Ses dosyaları MP3 → Opus** | ~%50 küçülme, sadece bildirim sesleri |

---

## 7. YAPILMAMASI Gerekenler

Araştırma sırasında tespit edilen **ama projeyi patlatma riski yüksek** veya **etkisi düşük** olduğu için listeden çıkarılan maddeler:

### ❌ Tüm POS State Mimarisini Baştan Yazmak

**Sebep:** POS veri akışı (Query + Zustand) projenin en kritik parçası. Tek seferde "hepsini Query'ye taşı" yaklaşımı, her bileşende değişiklik gerektirir ve test edilmesi haftalar alır.  
**Öneri:** [3.2](#32--pos-veri-akışında-çift-cache-query--zustand)'deki aşamalı geçiş stratejisi uygulanmalı.

### ❌ `"use client"` → Server Component Migration

**Sebep:** 29/35 sayfa client component. Server component'e geçmek için tüm veri akışını, hooks yapısını ve state yönetimini değiştirmek gerekir. Bu aşamada risk/getiri oranı düşük.

### ❌ `date-fns` → `dayjs` Değişimi

**Sebep:** 27 MB görünse de optimizePackageImports ile sadece kullanılan fonksiyonlar bundle'a girer. Değişim maliyeti (234 satırlık `formatters.ts` + tüm feature'lardaki import'lar) kazanca değmez.

### ❌ WebSocket Hub Mimarisi Değişikliği

**Sebep:** Mevcut hub pattern (ref-counted, shared) çalışıyor ve sağlam. Bağlantı sayısını azaltmak için [5.3](#53-pos-sayfasında-ws-bağlantı-sayısını-azaltma)'teki gibi küçük dokunuşlar yeterli.

### ❌ next/dynamic vs React.lazy Standardizasyonu

**Sebep:** 90+ dynamic import çalışıyor. İkisinin de performans farkı yok. Kod stili standardizasyonu ayrı bir task.

### ❌ Backend WS throttle genişletme

**Sebep:** Backend tarafı bu raporun kapsamı dışında. Frontend odaklı kalınmalı.

---

## 8. Etki/Zahmet Matrisi

```
YÜKSEK ETKI
    │
    │  ● P0.1 StationDisplay (15dk)    ● P0.2 POS çift cache (4s)
    │  ● P0.3 React.memo (2s)          ● P1.1 KDS selective merge (3s)
    │                                   ● P1.3 Optimistic update (4s)
    │
    │  ● P0.4 base-ui tree-shake (5dk)  ● P1.2 Menu Query migration (6s)
    │  ● P2.1 WS dedup (1s)
    │  ● P2.3 WS bağlantı azalt (1s)
    │
    │  ● P3.x (düşük öncelik)
    │
DÜŞÜK ETKI
    ────────────────────────────────────►
    DÜŞÜK ZAHMET            YÜKSEK ZAHMET
```

**Yapılması Gereken Sıra (Önerilen):**

```
Gün 1:  P0.1 (15dk) + P0.4 (5dk) + P0.3 (2s) → hemen kazanç
Gün 2:  P0.2 (4s) + P2.1 (1s) → POS çift cache çözümü
Gün 3:  P1.1 (3s) → KDS HTTP istekleri azalsın
Gün 4-5: P1.3 (4s) → Optimistic update
Hafta 2: P1.2 (6s) → Menu Query migration
Hafta 3: P2.2 + P2.3 + P3.x → ince ayarlar
```

---

## 9. Ölçüm ve Doğrulama Planı

Her optimizasyon öncesi ve sonrası aşağıdaki metrikler ölçülmelidir:

### 9.1 React DevTools Profiler

```bash
# POS sayfasında:
1. React DevTools → Profiler → Start Recording
2. Masa seç → ürün ekle → sepeti aç → kapat
3. Duration, re-render count, committed updates kaydet
```

**Hedef Değer:** POS sayfasında bir kullanıcı etkileşimi sonrası re-render sayısı **< 10 bileşen** (şu an tüm ağaç render oluyor).

### 9.2 Network İstek Sayacı

```bash
# KDS sayfasında:
1. DevTools → Network → WS messages + XHR
2. Bir sipariş durumu değişikliği sonrası HTTP istek sayısını ölç
```

**Hedef Değer:** Bir KDS olayı sonrası **0 HTTP isteği** (sadece WS state merge).

### 9.3 Lighthouse / Web Vitals

```bash
npm run build -- --webpack && ANALYZE=true next build --webpack
```

```bash
# Production build'de:
- Total blocking time (TBT) < 200ms
- Largest contentful paint (LCP) < 2.5s  
- Cumulative layout shift (CLS) < 0.1
```

### 9.4 Custom Performance Markers

```typescript
// POS sipariş süresi ölçümü
performance.mark("order-start");
// ... sipariş oluşturma ...
performance.mark("order-end");
performance.measure("order-flow", "order-start", "order-end");

// Konsolda:
// performance.getEntriesByType("measure")
//   .filter(m => m.name === "order-flow")
//   .map(m => m.duration)
```

**Hedef Değer:** POS sipariş akışı optimistic update sonrası **< 50ms** (UI hissi anlık).

---

## 10. Ek: Kod Örnekleri

### 10.1 useCallback + React.memo Birlikte Kullanım

```tsx
// ProductCard.tsx — DOĞRU PATTERN
interface ProductCardProps {
  product: Product;
  onSelect: (id: number) => void;
}

export const ProductCard = React.memo(function ProductCard({ 
  product, 
  onSelect 
}: ProductCardProps) {
  return (
    <button onClick={() => onSelect(product.id)}>
      <AppImage src={product.image} alt={product.name} />
      <span>{product.name}</span>
      <span>{formatPrice(product.price)}</span>
    </button>
  );
});

// Kullanıldığı yerde:
function MenuSection() {
  // ✅ useCallback ile stabil referans
  const handleSelect = useCallback((id: number) => {
    // ... işlem
  }, []);
  
  return products.map((p) => (
    <ProductCard key={p.id} product={p} onSelect={handleSelect} />
  ));
}
```

### 10.2 useShallow ile Zustand Selector

```tsx
// ❌ Yanlış: Tüm store'a abone olmak
const posStore = usePosStore(); // Her değişimde render!

// ✅ Doğru: Sadece ihtiyacın olanı seç
const tables = usePosStore((s) => s.tables);

// ✅ En iyisi: useShallow ile birden çok değer
import { useShallow } from "zustand/react/shallow";

const { tables, products, categories } = usePosStore(
  useShallow((s) => ({
    tables: s.tables,
    products: s.products,
    categories: s.categories,
  }))
);
```

### 10.3 React Query Selector ile Derived State

```tsx
// ❌ Yanlış: useEffect ile derived state
const { data: tables } = useQuery(...);
const [activeTables, setActiveTables] = useState([]);

useEffect(() => {
  setActiveTables(tables?.filter(t => t.status === "occupied") ?? []);
}, [tables]);

// ✅ Doğru: select ile derived state
const { data: activeTables } = useQuery({
  ...queryOptions,
  select: (tables) => tables.filter((t) => t.status === "occupied"),
});
```

### 10.4 Virtual Table onChange

```tsx
// virtual-table.tsx — DOĞRU KULLANIM
const virtualizer = useVirtualizer({
  count: data.length,
  getScrollElement: () => wrapperRef.current,
  estimateSize: () => rowHeightRef.current,
  overscan: overscan,
  onChange: useCallback((instance: Virtualizer<HTMLDivElement, Element>) => {
    if (!onEndReached) return;
    const { scrollOffset, getTotalSize } = instance;
    if (getTotalSize() - scrollOffset - wrapperRef.current.clientHeight < scrollThreshold) {
      onEndReached();
    }
  }, [onEndReached, scrollThreshold]),
});
```

---

## Ek: İlgili Dosyalar

| Optimizasyon | Ana Dosyalar |
|---|---|
| P0.1 StationDisplay re-render | `features/kds/components/StationDisplayScreen.tsx` |
| P0.2 POS çift cache | `features/pos/hooks/usePosDataSync.ts`, `store/usePosStore.ts` |
| P0.3 React.memo | `features/pos/components/{TableGrid,TableCard,MenuSection,ProductCard,CartSidebar}/**` |
| P0.4 base-ui tree-shake | `next.config.ts` |
| P1.1 KDS selektif merge | `features/kds/hooks/useKdsData.ts` |
| P1.2 Menu Query migration | `features/menu-management/hooks/useMenuData.ts` |
| P1.3 Optimistic update | `features/pos/components/CartSidebar/**` |
| P2.1 WS dedup | `features/kds/hooks/useKdsData.ts` |
| P2.2 Virtual table | `components/ui/virtual-table.tsx` |
| P2.3 WS bağlantı azaltma | `features/pos/hooks/usePosDataSync.ts` |

---

> **Not:** Bu rapordaki her optimizasyon bağımsız olarak uygulanabilir.  
> Bir maddeyi uygulamak için diğerini beklemenize gerek yok.  
> Önerilen sıra: **P0 → P1 → P2 → P3**
