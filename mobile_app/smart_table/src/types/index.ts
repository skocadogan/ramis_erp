// ============================================================
// Smart Table - TypeScript Tip Tanımları
// RAMIS ERP veri modelleri ile uyumlu
// ============================================================

// MARK: - Temel Türler

// MARK: - Şube & Masa

type TableStatus =
  "FREE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
type TableSize = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";
type TableShape = "ROUND" | "SQUARE" | "RECTANGLE";

export interface Table {
  id: string;
  zoneId: string;
  zoneName: string;
  name: string;
  tableNumber: number;
  capacity: number;
  size: TableSize;
  shape: TableShape;
  status: TableStatus;
  positionX: number;
  positionY: number;
}

// MARK: - Menü & Ürünler

export interface Category {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  order: number;
  color: string;
  imageUrl?: string;
  iconName?: string;
  productCount: number;
  parentId?: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  isPrimary: boolean;
  alt?: string;
}

type ProductUnit =
  "PORTION" | "HALF" | "FULL" | "GLASS" | "BOTTLE" | "PIECE" | "GRAM" | "KG";

export interface ProductUnitInfo {
  id: string;
  name: string;
  nameEn: string;
  type: ProductUnit;
  multiplier: number;
  price: number;
  isDefault: boolean;
}

export interface Allergen {
  id: string;
  name: string;
  nameEn: string;
  icon?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

interface NutritionalInfo {
  calories?: number;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  sodium?: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  nameEn: string;
  priceAdjustment: number;
  isDefault: boolean;
}

interface Modifier {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  isDefault: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  nameEn: string;
  isRequired: boolean;
  isMultiple: boolean;
  maxSelection: number;
  minSelection: number;
  modifiers: Modifier[];
}

export interface ProductRecommendation {
  id: string;
  productId: string;
  name: string;
  basePrice: number;
  hasDiscount?: boolean;
  discountedPrice?: number | null;
  units: ProductUnitInfo[];
  productUnitId?: string | null;
  productUnitName?: string | null;
  order: number;
}

export interface CombinedProductItem {
  id: string;
  productId: string;
  productName: string;
  productNameEn?: string;
  quantity: number;
  productUnitId?: string | null;
  productUnitName?: string | null;
  productUnitNameEn?: string | null;
}

export interface Product {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  ingredients: string;
  ingredientsEn: string;
  basePrice: number;
  grossPrice: number;
  taxRate: number;
  discountRate: number;
  hasDiscount?: boolean;
  discountedPrice?: number;
  imageUrl: string;
  images: ProductImage[];
  units: ProductUnitInfo[];
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
  allergens: Allergen[];
  nutritionalInfo?: NutritionalInfo;
  isAllergenic: boolean;
  isCombined: boolean;
  isActive: boolean;
  showOnPos: boolean;
  preparationTime?: number;
  rating?: number;
  ratingCount?: number;
  isFeatured?: boolean;
  isPopular?: boolean;
  isChefRecommendation?: boolean;
  isNew?: boolean;
  /** "Ürün kısıtına göre" modu (ProductDayAvailability):
   *  AVAILABLE / LIMITED / SOLD_OUT / UNLIMITED */
  availabilityMode?: "AVAILABLE" | "LIMITED" | "SOLD_OUT" | "UNLIMITED";
  /** availabilityMode === "LIMITED" iken kalan porsiyon */
  remainingPortions?: number | null;
  /** POS'un bu üründe nasıl davranacağı: BLOCK / WARN / OFF */
  posBlockMode?: "BLOCK" | "WARN" | "OFF";
  /** Yanında önerilen ürünler */
  hasRecommendations?: boolean;
  recommendations?: ProductRecommendation[];
  combinedItems: CombinedProductItem[];
}

// MARK: - Sipariş

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";
export type OrderItemStatus =
  "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
type OrderType = "TABLE" | "TAKEAWAY";

export interface CartItemModifier {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  price: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productNameEn: string;
  imageUrl: string;
  variant?: ProductVariant;
  unit: ProductUnitInfo;
  quantity: number;
  modifiers: CartItemModifier[];
  /** Ürün net satış fiyatı (varsayılan birim, ekstra / satış birimi farkı hariç) */
  productSalePrice: number;
  unitPrice: number;
  totalPrice: number;
  note?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productNameEn: string;
  imageUrl: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: OrderItemStatus;
  modifiers: CartItemModifier[];
  note?: string;
  unitName?: string;
  unitNameEn?: string;
  parentItemId?: string | null;
  isCombinedProduct?: boolean;
  combinedParts?: {
    productName: string;
    quantityTotal: number;
    unitName?: string | null;
  }[];
  estimatedPrepTime?: number;
  createdAt: string;
  /** Garson mutfak bildiriminde görüldü işaretlediğinde set edilir */
  waiterAcknowledgedAt?: string;
}

export interface Order {
  id: string;
  tableId: string;
  tableName: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  estimatedCompletionTime?: string;
}

// MARK: - Garson Çağrı

export type WaiterCallType = "SERVICE" | "BILL" | "HELP" | "WATER" | "ORDER";
type WaiterCallStatus = "PENDING" | "ACKNOWLEDGED" | "COMPLETED";

export interface WaiterCall {
  id: string;
  tableId: string;
  tableName: string;
  type: WaiterCallType;
  status: WaiterCallStatus;
  note?: string;
  createdAt: string;
  acknowledgedAt?: string;
}

// MARK: - UI State

export type Language = "tr" | "en";
export type ThemeMode = "light" | "dark";
