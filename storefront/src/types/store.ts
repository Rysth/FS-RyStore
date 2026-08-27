// Shared types for the RyStore storefront. These mirror the JSON shapes served
// by the Rails public API (backend/app/controllers/api/v1/public/*).

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
  price: string;
  stock: number | null;
}

export interface StoreProduct {
  id: number;
  name: string;
  slug: string;
  kind?: "product" | "service";
  description: string | null;
  price: string;
  compare_at_price: string | null;
  /** The main photo. og:image and the JSON-LD need exactly one. */
  image_url: string | null;
  /**
   * The gallery in order, main photo first. Same first element as image_url.
   * Optional so a cached response from before galleries existed still parses.
   */
  images?: string[];
  /**
   * One short clip, or null. Its own field rather than a member of `images`:
   * the gallery renders an <img> for everything in there.
   */
  video_url?: string | null;
  stock: number | null;
  category_name: string | null;
  category_slug: string | null;
  price_tiers: PriceTier[];
  option_types?: ProductOptionType[];
  variants?: ProductVariant[];
}

/** One product inside a combo, with how many units of it the combo includes. */
export interface StorePromotionItem {
  quantity: number;
  product: StoreProduct;
}

/**
 * A combo: several products sold together at one price, featured on the home
 * page. The buyer can take the whole bundle or any single product in it, which
 * is why each item carries a full StoreProduct and not just a name.
 */
export interface StorePromotion {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  /** What the same products cost bought one by one. */
  regular_total: string;
  savings: string;
  discount_percent: number;
  image_url: string | null;
  /** null when nothing in the combo tracks stock. */
  available_units: number | null;
  ends_at: string | null;
  items: StorePromotionItem[];
}

export interface StoreCategory {
  id: number;
  name: string;
  slug: string;
  featured: boolean;
  image_url: string | null;
}

export interface StoreSettings {
  name: string;
  slogan: string;
  logo_url: string;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  address: string | null;
  /** Google Maps link for the shop's location. Rendered as a "Cómo llegar" link. */
  maps_url: string | null;
  delivery_notes: string | null;
  bank_instructions: string | null;
  primary_color: string | null;
  /**
   * False while the shop has taken the store offline to rework it. The API also
   * refuses the catalog endpoints in that state — this flag is what lets the
   * storefront say so in the shop's own words instead of showing an error.
   */
  published: boolean;
}

/**
 * A line in the cart: either a product (product_id) or a combo (promotion_id),
 * never both. Both shapes share the same fields so every consumer — the drawer,
 * the cart page, the totals — can treat a line as a line.
 */
export interface CartItem {
  /** 0 on a combo line, which has no single product behind it. */
  product_id: number;
  variant_id?: number | null;
  /** Set only on a combo line. Optional so carts saved before combos parse. */
  promotion_id?: number | null;
  name: string;
  variant_label?: string | null;
  /** What a combo contains ("Sérum x1 · Crema x2"); null on a product line. */
  details?: string | null;
  /** Empty on a combo line: combos have no page of their own to link to. */
  slug: string;
  kind?: "product" | "service";
  price: string;
  image_url: string | null;
  stock: number | null;
  quantity: number;
  /** Optional so a cart persisted before wholesale tiers existed still parses. */
  price_tiers?: PriceTier[];
}

export interface Pagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
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

export interface CheckoutCustomer {
  customer_name: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  checkout_fax_confirmation?: string;
  payment_method: PaymentMethod;
  delivery_method: DeliveryMethod;
}

export interface CheckoutResult {
  id: number;
  number: string;
  subtotal: string;
  discount_amount: string;
  coupon_code: string | null;
  total: string;
  status: string;
  token: string;
  payment_method: PaymentMethod;
  payment_proof_required: boolean;
}

export interface CouponPreview {
  coupon: { code: string; discount_type: "percentage" | "fixed"; discount_value: string };
  subtotal: string;
  discount_amount: string;
  total: string;
}

export interface ConfirmedOrderItem {
  product_name: string;
  /** What a combo line contained; null on an ordinary product line. */
  details?: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface ConfirmedOrder {
  number: string;
  status: string;
  subtotal: string;
  discount_amount: string;
  coupon_code: string | null;
  total: string;
  customer_name: string;
  phone: string;
  address: string | null;
  city: string | null;
  notes: string | null;
  payment_method: PaymentMethod;
  payment_method_label: string;
  delivery_method: DeliveryMethod;
  delivery_method_label: string;
  payment_proof_required: boolean;
  payment_proof_url: string | null;
  created_at: string;
  items: ConfirmedOrderItem[];
}
