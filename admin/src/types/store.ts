// Shared types for the RyStore catalog, orders and storefront.

export interface Category {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  position: number;
  image_url: string | null;
  products_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Branch {
  id: number;
  name: string;
  address: string | null;
  hours: string | null;
  phone: string | null;
  whatsapp: string | null;
  maps_url: string | null;
  active: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface DownloadableCatalog {
  id: number;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  file_url: string;
  active: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface PriceTier {
  min_quantity: number;
  /** Decimal string, e.g. "4.20" — never a float. */
  unit_price: string;
}

export interface ProductOptionType {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: number;
  options: Record<string, string>;
  label: string;
  sku: string | null;
  price: string | null;
  stock: number | null;
  position: number;
}

/** One photo in a product's gallery. Position 0 is the main one. */
export interface ProductImage {
  id: number;
  position: number;
  url: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  kind: "product" | "service";
  description: string | null;
  price: string;
  compare_at_price: string | null;
  category_id: number | null;
  category_name: string | null;
  image_url: string | null;
  /**
   * The gallery, ordered, main photo first. Empty for a product that predates
   * galleries — its single photo lives in image_url and is managed by the older
   * upload endpoint.
   */
  images?: ProductImage[];
  /** One short clip, or null. Kept apart from the gallery — see Product#video. */
  video_url?: string | null;
  active: boolean;
  default_ingredients: string[];
  stock: number | null;
  total_stock?: number | null;
  price_tiers: PriceTier[];
  option_types: ProductOptionType[];
  variants: ProductVariant[];
  branch_ids: number[];
  branches: Branch[];
  created_at?: string;
  updated_at?: string;
}

/** One product inside a combo, as the promotions API returns it. */
export interface PromotionItem {
  product_id: number;
  quantity: number;
  position: number;
  product_name: string | null;
  product_slug: string | null;
  product_price: string | null;
  product_active: boolean | null;
  product_stock: number | null;
  image_url: string | null;
}

export interface Promotion {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** What the whole combo costs. Decimal string, like every other price. */
  price: string;
  /** What its products cost bought one by one, so the card can show the saving. */
  regular_total: string;
  savings: string;
  discount_percent: number;
  active: boolean;
  /** Switched on *and* inside its date window — what `active` alone can't say. */
  live: boolean;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  /** null when nothing in the combo tracks stock. */
  available_units: number | null;
  items: PromotionItem[];
  created_at?: string;
  updated_at?: string;
}

export const PAYMENT_METHODS = {
  EFECTIVO: "efectivo",
  TRANSFERENCIA: "transferencia",
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const DELIVERY_METHODS = {
  DOMICILIO: "domicilio",
  RETIRO: "retiro",
} as const;

export type DeliveryMethod =
  (typeof DELIVERY_METHODS)[keyof typeof DELIVERY_METHODS];

export const ORDER_STATUSES = [
  "pendiente",
  "confirmado",
  "preparando",
  "entregado",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pendiente: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  confirmado: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  preparando: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  entregado: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelado: "bg-red-100 text-red-800 hover:bg-red-100",
};

export interface OrderItem {
  id: number;
  /** null once the product leaves the catalog — the line keeps its own copy. */
  product_id: number | null;
  product_name: string;
  /** "Talla M / Negro" when the line was a variant. */
  variant_label: string | null;
  /** What a combo line contained ("Sérum x1 · Crema x2"), frozen at purchase. */
  details?: string | null;
  /** Resolved server-side from the product's gallery; null if it has no photo. */
  image_url: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface Order {
  id: number;
  number: string;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  payment_method: PaymentMethod;
  payment_method_label: string;
  delivery_method: DeliveryMethod;
  delivery_method_label: string;
  status: OrderStatus;
  subtotal: string;
  discount_amount: string;
  coupon_code: string | null;
  total: string;
  customer_id: number | null;
  items_count: number;
  payment_proof_url: string | null;
  items?: OrderItem[];
  created_at: string;
  updated_at: string;
}

export const DISCOUNT_TYPES = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
} as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];

export interface Coupon {
  id: number;
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  min_order_total: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  orders_count: number;
  total_spent: string;
  last_order_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerOrderSummary {
  id: number;
  number: string;
  status: OrderStatus;
  total: string;
  created_at: string;
}

export interface Pagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
}

// Prices come from the API as decimal strings — always format through here
export function formatPrice(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}
