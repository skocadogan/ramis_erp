# State Management (Zustand State Yönetimi)

> **Özet:** Zustand 5 ile yönetilen üç ana store: AuthStore (oturum), PosStore (POS durumu) ve SidebarStore (navigasyon). Persist middleware ile localStorage desteği; POS ayarları cloud preferences ile çoklu terminal arası senkronize edilir.
> **Kütüphaneler:** Zustand 5, fast-deep-equal
> **Bağlantılar:** [[Auth_Flow]], [[Frontend_POS]], [[Frontend_Architecture]], [[Reporting]], [[ReceiptTemplate]], [[Printing]]

---

## Konum
`frontend/src/store/`

## Store'lar

### useAuthStore
Oturum yönetimi — `persist` middleware ile `localStorage`.

| State | Tip | Açıklama |
|-------|-----|----------|
| `user` | `AuthUser \| null` | Giriş yapan kullanıcı |
| `token` | `string \| null` | JWT access token |
| `rememberMe` | `boolean` | Kalıcı oturum |

**"Beni Hatırla":** `sessionStorage` marker ile tarayıcı kapanma tespiti.

---

### usePosStore
POS ekranı durumu — `subscribeWithSelector` middleware.

**Veri:** `branches`, `tables`, `zones`, `categories`, `products`, `readyItems`

**UI State:** `selectedTable`, `selectedZone`, `selectedCategory`, `cart`, `terminalId`

**CFD Sync:** `activeDisplayOrder`, `displayMetadata`, `displaySuccessSignal`

**Ayarlar (terminal/şube paylaşımlı):**

| State | Tip | Açıklama |
|-------|-----|----------|
| `showReadyNotifs` | `boolean` | Hazır kalem bildirimi |
| `playNotifSound` | `boolean` | Bildirim sesi |
| `paymentPrinters` | `{ printerId: string; templateSlug: string }[]` | Ödeme tamamlandığında basılacak yazıcı/şablon çiftleri |
| `autoPrintOrder` | `boolean` | Sipariş sonrası istasyon yazıcılarına otomatik baskı |
| `autoPrintPayment` | `boolean` | Ödeme fişini otomatik bas |
| `stockTrackingMode` | `'PRODUCT' \| 'INGREDIENT'` | Stok kontrolü ürün bazlı (`86 listesi`) ya da hammadde bazlı |

(Eski tek-yazıcı `receiptPrinterId` ve `autoPrintReceipt` alanları yerine **çoklu liste** modeline geçildi.)

**Derived Selectors:**
`selectCartTotal` — sepet toplamı; `item.unitPrice ?? product.discounted_price ?? product.base_price` öncelik sırasıyla hesaplar.

**Yardımcı Aksiyonlar:**

| Aksiyon | Etki |
|---------|------|
| `setProducts(list)` | Katalog setlerken sepetteki kalemleri yeni fiyatla yeniler (kaybolan ürünler korunur, fiyat farkı `unitPrice` üzerinden taşınır) |
| `switchPosTerminal()` | Terminal, sepet, masa ve müşteri ekranı durumunu sıfırlar |
| `persistTerminalSelection()` | Terminali günceller ve sunucuya anında kaydeder (özellikle garson ekranı terminal ataması için) |
| `initializeSettings(prefs)` | Cloud preferences'tan ayarları yükler (yeni printer listeleri ve `stockTrackingMode` dahil) |

**LocalStorage & Cloud Senkronizasyonu:**
- `usePosStore.subscribe(state => state.<setting>, ...)` blokları her ayar değişikliğinde:
  1. `localStorage`'a yazar (terminal yenilemesinde geri yükleme).
  2. `applyServerPosScreenPreferences(...)` ile backend'e gönderir → cloud preferences şube içi diğer terminallere dağıtılır.
- Yeni eklenen ayarlar (`paymentPrinters`, `autoPrintOrder`, `autoPrintPayment`, `stockTrackingMode`) bu blokların kapsamına dahildir.

---

### useSidebarStore
Sidebar açık/kapalı durumu — `persist` middleware ile `localStorage`.

| State | Tip | Açıklama |
|-------|-----|----------|
| `collapsed` | `boolean` | Sidebar daraltılmış mı |
| `openGroups` | `Set<string>` | Açık navigasyon grupları (`definitions`, `restaurant`, `kitchen`) |

---

## Hook'lar (`src/hooks/`)

Detaylı bilgi: [[Frontend_Hooks]]

| Hook | İşlev |
|------|-------|
| `useBranchContext` | Aktif şube bağlamı ([[Frontend_Branches]]) |
| `useCanViewAmounts` | Tutar görüntüleme yetkisi |
| `useCleaningCountdown` | Masa temizlik geri sayımı |
| `useDebounce` | Debounce değer |
| `useIdempotency` | Çift gönderim önleme (F-14) |
| `useMatchMedia` | Responsive medya sorgusu (SSR-güvenli) |
| `useModulePermissions` | Modül izin kontrolü ([[Frontend_RBAC]]) |
| `useRequireModulePermission` | İzin zorunluluğu + yönlendirme |

---

## Smart Table Store'ları

Smart Table (`mobile_app/smart_table/`) React Native masaüstü uygulaması, web frontend'den bağımsız kendi Zustand store'larına sahiptir:

### `useAuthStore`
`mobile_app/smart_table/src/store/auth-store.ts`
- JWT token, `serverUrl`, kullanıcı bilgisi.
- `SecureStore` ile persist edilir; `init()` ile boot'ta geri yüklenir.

### `useTableStore`
`mobile_app/smart_table/src/store/table-store.ts`
- Seçili şube (`selectedBranch`) ve masa (`selectedTable`).
- `SecureStore` ile persist.

### `useCartStore`
`mobile_app/smart_table/src/store/cart-store.ts`
- Sepet kalemleri, ürün ekle/çıkar, toplam hesaplama.
- `getItemCount()` → tab bar rozetinde kullanılır.

### `useOrderStore`
`mobile_app/smart_table/src/store/order-store.ts`
- Sipariş listesi, WS ile canlı senkron.
- `fetchOrders()`, `applyWsOrderStatusChange()`, `clearOrders()`.

### `useUIStore`
`mobile_app/smart_table/src/store/ui-store.ts`
- `theme` (`dark` / `light`), `language` (`tr` / `en`).
- Boşta kalma zaman aşımı (`idleTimeout`), `SecureStore` ile persist.

### `useMenuStore`
`mobile_app/smart_table/src/store/menu-store.ts`
- `refreshVersion` sayacı — WebSocket `menu_catalog_refresh` olayında artar.
- `useMenu` hook'u bu değeri izler ve otomatik yeniden yüklenir.

### `useDialogStore`
`mobile_app/smart_table/src/store/dialog-store.ts`
- Tema uyumlu Modal dialog (`Dialog` bileşeni).
- Metotlar: `alert()`, `confirm()`, `show()`, `hide()`.
- Native `Alert.alert()` çağrılarının tamamı bu store'a taşınmıştır.

Detaylı bilgi: [[Smart_Table]]
