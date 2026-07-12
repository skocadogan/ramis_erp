/**
 * Rota → i18n modül eşlemesi.
 * Her sayfa sadece ihtiyacı olan modülleri SSR'da yükler,
 * böylece HTML payload'ı ~200-250KB küçülür.
 *
 * Eşleşmeyen rotalar veya ana sayfa için sadece base modüller yüklenir.
 */

/**
 * Tüm sayfalarda her zaman yüklenen temel modüller.
 * `auth` → login/kullanıcı mesajları,
 * `branches` → şube seçici (BranchSelect birçok sayfada kullanılır),
 * `common` → genel UI (buton, dialog, vb.),
 * `errors` → API hata mesajları.
 */
const BASE_MODULES = ['common', 'auth', 'branches', 'errors'] as const;

/**
 * Tüm mevcut modüller (geriye dönük uyumluluk referansı).
 */
export const ALL_MODULES = [
  ...BASE_MODULES,
  'branches',
  'pos',
  'kds',
  'inventory',
  'warehouse',
  'warehouse_return_cancel',
  'sales',
  'shifts',
  'admin',
  'dashboard',
  'menu_management',
  'recipes',
  'invoices',
  'reservations',
  'credit',
  'production',
  'prep',
  'performances',
  'reporting',
  'tables',
  'users',
  'waiter',
  'recycle_bin',
  'allergens',
  'customers',
] as const;


