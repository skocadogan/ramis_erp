export interface Branch { id: string; name: string; code: string; }

/** POS / menü seçeneği (modifier). */
export interface ProductModifier {
  id: string;
  name: string;
  price_adjustment: number;
}

interface ModifierGroupOption {
  id: string;
  name: string;
  is_multiple: boolean;
  is_required: boolean;
  modifiers: ProductModifier[];
}

/** Menü ürün birimi (POS sepet / API ile uyumlu alanlar). */
export interface ProductUnit {
  id?: string;
  name: string;
  multiplier: number;
  price_override?: number | null;
  order?: number;
}

/** Müşteri ekranı — kasiyer seçenek modalı senkronu. */
export interface DisplayOptionsModalSync {
  productName: string;
  step: "unit" | "modifiers";
  standardUnitPrice?: number;
  units?: { name: string; price: number }[];
  modifiers: { id: string; name: string; price_adjustment: number }[];
  /** Seçili birim adı; `null` = standart birim. */
  selectedUnitName?: string | null;
  /** Seçili seçenek (modifier) kimlikleri. */
  selectedModifierIds?: string[];
  /** Üründe allerjen var mı (müşteri ekranı shield göstergesi). */
  hasAllergens?: boolean;
  /** Porsiyon başına enerji değeri (kCal) */
  calories?: number | null;
}

/** Müşteri ekranı — kasiyer allerjen diyaloğu senkronu. */
export interface DisplayAllergenModalSync {
  productName: string;
  allergens: { id: string; name: string }[];
}

/** POS katalog — yanında önerilen ürün kaydı. */
export interface ProductRecommendationPos {
  id: string;
  product_id: string;
  name: string;
  base_price: number;
  has_discount?: boolean;
  discounted_price?: number | null;
  units?: ProductUnit[];
  product_unit_id?: string | null;
  product_unit_name?: string | null;
  order: number;
}

/** Müşteri ekranı — kasiyer öneri diyaloğu senkronu. */
export interface DisplayRecommendedModalSync {
  sourceProductName: string;
  items: {
    productId: string;
    name: string;
    unitName: string | null;
    price: number;
    quantityInCart: number;
  }[];
}

interface DisplaySurveyQuestionOption {
  id: string
  label: string
  sort_order: number
}

interface DisplaySurveyQuestion {
  id: string
  text: string
  answer_type: "RATING" | "YES_NO" | "OPTION" | "SHORT_TEXT"
  question_role: "NONE" | "NPS" | "FOOD" | "SERVICE" | "SPEED" | "CLEANLINESS"
  sort_order: number
  is_required: boolean
  placeholder: string
  rating_min_value: number
  rating_max_value: number
  options: DisplaySurveyQuestionOption[]
}

interface DisplaySurveyDefinition {
  id: string
  title: string
  description: string
  questions: DisplaySurveyQuestion[]
}

export interface DisplaySurveyPrompt {
  session_id: string
  session_key: string
  source: string
  sale?: string | null
  order?: string | null
  table?: string | null
  completion_signal?: "PAYMENT" | "ORDER"
  survey: DisplaySurveyDefinition
}

/** Birleşik ürün alt kalemi (API’den gelen esnek yapı). */
interface CombinedProductListItem {
  id?: string;
  quantity?: number;
  /** API bazen düz alan, bazen `product.name` kullanır */
  product_name?: string;
  product_unit_name?: string | null;
  product_category_station?: string | null;
  product_unit_multiplier?: number;
  product?: { id?: string; name?: string };
  [key: string]: unknown;
}

/** Masa/Paket sipariş özeti — müşteri ekranı senkronu. */
export interface PosActiveOrderLineItem {
  id: string;
  product_name?: string;
  unit_price: number;
  quantity: number;
  unit_name?: string | null;
  /** Sipariş kalemi seçenekleri (müşteri ekranı) */
  modifiers?: { id: string; modifier_name: string; price?: number }[];
  /** Örn. CANCELLED — müşteri ekranı satır gösterimi için */
  status?: string;
}

export interface PosActiveOrderSnapshot {
  discount_amount?: number;
  total_amount: number;
  table_name?: string;
  items: PosActiveOrderLineItem[];
}

export interface Table {
  id: string;
  name: string;
  table_number: number;
  zone_name: string;
  capacity: number;
  /** POS sanal paket satırı (backend `takeaway_virtual`) */
  virtual_kind?: "new_slot" | "takeaway_order";
  /** Sanal paket siparişi: aktif sipariş kimliği */
  linked_order_id?: string | null;
  status: "FREE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
  /** OCCUPIED: KITCHEN = mutfak/teslim öncesi (turuncu), SETTLE = ürünler teslim, hesap (kırmızı) */
  pos_occupied_flow?: "KITCHEN" | "SETTLE" | null;
  cleaning_started_at?: string | null;
  cleaning_until?: string | null;
  cleaning_remaining_seconds?: number | null;
  active_order?: { id: string; total_amount: number; created_at?: string; status?: string } | null;
  /** API: birden fazla açık sipariş (varsa) */
  active_orders?: { id: string; total_amount: number }[];
  order_count?: number;
  reservation_info?: string;
  reservation_scheduled_at?: string | null;
  reservation_party_size?: number | null;
  zone: string;
  /** Paket bölgesi: temizlik akışı yok */
  zone_is_takeaway?: boolean;
  assigned_waiters?: string[];
}

export interface Zone { id: string; name: string; is_active: boolean; is_takeaway: boolean; color?: string; }

export interface Category { id: string; name: string; color?: string; order?: number; parent?: string | null; }

export interface Product {
  id: string
  name: string
  description?: string | null
  base_price: number
  category: string
  category_name: string
  category_color?: string
  /** Kategori mutfak istasyonu (sipariş baskısı yönlendirmesi) */
  category_station?: string | null
  category_station_name?: string | null
  image: string | null
  /** Menüde satışa kapalı; POS’ta pasif kart */
  is_active?: boolean
  /** false ise POS’ta hiç listelenmez; undefined eski veri için görünür kabul edilir */
  show_on_pos?: boolean
  /** Öne çıkan ürün mü? */
  is_featured?: boolean
  /** Her kayıtta değişir; liste satırının POS’ta yeniden çizilmesi için */
  updated_at?: string
  /** İndirim oranı (0-100) */
  discount_rate?: number
  /** İndirim uygulanmış fiyat */
  discounted_price?: number | null
  /** İndirim aktif mi */
  has_discount?: boolean
  is_combined?: boolean
  combined_items?: CombinedProductListItem[]
  units?: ProductUnit[]
  modifier_groups?: ModifierGroupOption[]
  // 86 / Bulunabilirlik kısıtları
  availability_mode?: 'UNLIMITED' | 'LIMITED' | 'SOLD_OUT';
  remaining_portions?: number | null;
  pos_block_mode?: 'WARN' | 'BLOCK' | 'OFF';
  /** Rezervasyonlar nedeniyle mi tükendi? */
  is_reserved_out?: boolean;
  /** Reçeteli ürünlerde allerjen uyarısı */
  is_allergenic?: boolean;
  allergens?: { id: string; name: string; risk_score: number }[];
  /** Yanında önerilen ürünler */
  has_recommendations?: boolean;
  recommendations?: ProductRecommendationPos[];
  /** Menü ürünü KDV / satış vergisi yüzdesi */
  tax_rate?: number;
  /** Porsiyon başına enerji değeri (kCal) */
  calories?: number | null;
}

export interface CartItem {
  cartId: string; // Benzersiz satır kimliği (aynı ürün farklı notlarla ayrı satırlarda)
  product: Product;
  quantity: number;
  selectedUnit?: ProductUnit | null;
  unitPrice?: number; // Price of the specific unit selected (calculated or override)
  selectedModifiers?: ProductModifier[];
  /** Ürün bazlı mutfak/garson notu (sipariş kalemi `notes`) */
  notes?: string;
  /** Masa/hesap ödeme senkronu: sipariş kalemi durumu (müşteri ekranı; örn. CANCELLED) */
  orderLineStatus?: string;
}

export interface ReadyItem {
  id: string;
  product_name: string;
  table_name: string;
  quantity: number;
  status: string;
  updated_at: string;
  station_name: string;
  unit_name?: string | null;
  order_id?: string;
  order_number?: string | null;
  order_type?: "TABLE" | "TAKEAWAY";
  waiter_acknowledged_at?: string | null;
}
