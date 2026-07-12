/**
 * Merkezi domain tipleri — any kullanımını azaltır, IDE otomatik tamamlama sağlar.
 *
 * Backend seri hale getirici alanlarıyla birebir eşleşmesi amaçlanmıştır.
 * Değişiklik gerektiğinde yalnızca bu dosyayı güncellemeniz yeterlidir.
 */

// ---------------------------------------------------------------------------
// Zone / Table
// ---------------------------------------------------------------------------

export interface Zone {
  id: number | string;
  name: string;
  is_active?: boolean;
  is_takeaway?: boolean;
}

interface TableOrder {
  id: number | string;
  status:
    "open" | "closed" | "cancelled" | "PENDING" | "PREPARING" | "READY" | "DELIVERED" | string;
  total?: number | string;
  /** ISO tarih dizisi */
  created_at?: string;
}

export interface Table {
  id: number | string;
  name: string;
  zone: Zone | number | string;
  status?: string;
  is_active?: boolean;
  is_occupied?: boolean;
  /** Sanal masalar (takeaway) için true */
  is_virtual?: boolean;
  /** Sanal masa alt türü (örn. takeaway yeni slotları) */
  virtual_kind?: string;
  capacity?: number;
  /** Anlık açık sipariş özeti */
  active_order?: TableOrder | null;
  /** Epoch — güncelleme sayacı */
  epoch?: number;
  /** Rezervasyon detayları */
  reservation_info?: string;
  reservation_scheduled_at?: string;
  reservation_party_size?: number;
}

// ---------------------------------------------------------------------------
// Product / Category
// ---------------------------------------------------------------------------

export interface Category {
  id: number | string;
  name: string;
  sort_order?: number;
  parent?: number | string | null;
}

type StockTrackingMode = "none" | "warn" | "strict";

type AvailabilityMode = "AVAILABLE" | "LIMITED" | "SOLD_OUT";

export interface ProductUnit {
  id: string;
  name: string;
  multiplier?: number | string;
  price_override?: number | string | null;
}

export interface ProductRecommendation {
  id: string;
  product_id: string;
  name: string;
  base_price: number | string;
  has_discount?: boolean;
  discounted_price?: number | string | null;
  units?: ProductUnit[];
  product_unit_id?: string | null;
  product_unit_name?: string | null;
  order?: number;
}

export interface Product {
  id: number | string;
  name: string;
  /** Görüntüleme fiyatı (indirimli varsa `discounted_price` kullanılır) */
  price: number | string;
  /** Backend ham fiyatı */
  base_price?: string | null;
  /** İndirimli fiyat */
  discounted_price?: string | null;
  /** İndirim oranı (%) */
  discount_rate?: string | null;
  has_discount?: boolean;
  category?: number | string;
  category_name?: string;
  is_featured?: boolean;
  is_active?: boolean;
  stock?: number | null;
  stock_tracking?: StockTrackingMode;
  description?: string;
  image?: string | null;
  /** Stok / rezervasyon tabanlı tükenme (eski alan) */
  is_reserved_out?: boolean;
  /** Yeni stok modu */
  availability_mode?: AvailabilityMode;
  /** `availability_mode === "LIMITED"` iken kalan porsiyon */
  remaining_portions?: number | null;
  pos_block_mode?: "BLOCK" | "WARN";
  is_allergenic?: boolean;
  allergens?: { id: string; name: string; risk_score: number }[];
  has_recommendations?: boolean;
  recommendations?: ProductRecommendation[];
  units?: ProductUnit[];
  modifier_groups?: {
    id: string;
    name: string;
    is_required?: boolean;
    is_multiple?: boolean;
    modifiers: { id: string; name: string; price_adjustment?: number | string }[];
  }[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Production Plan / Availability
// ---------------------------------------------------------------------------

export interface ProductionPlanLine {
  id: number | string;
  product: number | string;
  product_name?: string;
  category_name?: string;
  station_name?: string;
  target_quantity: number | string;
}

export interface ProductionPlan {
  id: number | string;
  branch_name?: string;
  status: string;
  lines?: ProductionPlanLine[];
}

export interface AvailabilityLine {
  product: number | string;
  mode: "LIMITED" | "SOLD_OUT" | "AVAILABLE";
  remaining_portions?: number | string;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  /** Sepet içi benzersiz kimlik */
  cartId: string;
  productId: number | string;
  name: string;
  price: number | string;
  quantity: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

type OrderStatus = "open" | "preparing" | "ready" | "delivered" | "cancelled";

interface OrderItemModifier {
  id: string;
  modifier_name: string;
  price: number | string;
}

interface OrderItem {
  id: number | string;
  product: number | string;
  product_name?: string;
  quantity: number;
  unit_price: number | string;
  status?: string;
  note?: string;
  modifiers?: OrderItemModifier[];
}

export interface Order {
  id: number | string;
  table?: number | string;
  status: OrderStatus | string;
  items: OrderItem[];
  total?: number | string;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

export interface Shift {
  id: number | string;
  terminal?: number | string;
  status: "OPEN" | "CLOSED" | string;
  started_at?: string;
  ended_at?: string | null;
}

// ---------------------------------------------------------------------------
// User / Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  branchId: string;
  branchName?: string;
}
