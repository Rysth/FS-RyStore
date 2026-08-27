import { computed } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import type {
  CartItem,
  ProductVariant,
  StoreProduct,
  StorePromotion,
} from "../types/store";
import { lineTotal } from "./pricing";

/**
 * Buyers never create an account, so the cart lives entirely in localStorage.
 *
 * The key is `-v2` because the previous storefront (inside the admin SPA) wrote
 * a zustand-shaped blob — `{ state: { items }, version }` — that persistentAtom
 * cannot read. A fresh key avoids parsing someone else's format.
 */
export const cartItems = persistentAtom<CartItem[]>("rystore-cart-v2", [], {
  encode: JSON.stringify,
  decode: (value) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
    } catch {
      return [];
    }
  },
});

/**
 * What makes two lines the same line.
 *
 * A combo is keyed by its promotion, a product by the product/variant pair —
 * one string either way, so callers can pass a line around instead of
 * destructuring it into two or three arguments that must stay in step.
 */
export function lineKey(item: Pick<CartItem, "product_id" | "variant_id" | "promotion_id">): string {
  if (item.promotion_id) return `promo:${item.promotion_id}`;

  return `product:${item.product_id}:${item.variant_id ?? ""}`;
}

/** Never let the cart exceed tracked stock; a null stock means untracked. */
function cap(wanted: number, stock: number | null | undefined): number {
  if (stock == null) return wanted;
  return Math.min(wanted, stock);
}

/** Adds a line, or tops up the matching one, refreshing its stored snapshot. */
function upsert(line: CartItem, quantity: number): void {
  const items = cartItems.get();
  const key = lineKey(line);
  const existing = items.find((item) => lineKey(item) === key);

  if (existing) {
    // Refresh the snapshot from the incoming line too, so a cart that has been
    // sitting in localStorage since before a price change heals itself.
    cartItems.set(
      items.map((item) =>
        lineKey(item) === key
          ? { ...line, quantity: cap(item.quantity + quantity, line.stock) }
          : item,
      ),
    );
    return;
  }

  cartItems.set([...items, { ...line, quantity: cap(quantity, line.stock) }]);
}

export function addItem(
  product: StoreProduct,
  quantity = 1,
  variant?: ProductVariant | null,
): void {
  const variantId = variant?.id ?? null;

  upsert(
    {
      product_id: product.id,
      variant_id: variantId,
      promotion_id: null,
      name: product.name,
      variant_label: variant?.label ?? null,
      details: null,
      slug: product.slug,
      price: variant ? variant.price : product.price,
      kind: product.kind ?? "product",
      image_url: product.image_url,
      stock: variant ? variant.stock : product.stock,
      quantity: 0,
      price_tiers: product.price_tiers ?? [],
    },
    quantity,
  );
}

/**
 * Adds the whole combo as a single line at its combo price.
 *
 * Deliberately not "add each of its products": the discount belongs to the
 * bundle, and the server prices a combo line from the promotion, not from the
 * sum of its parts. Buying the products one by one is the other button on the
 * card, and it charges list price — which is the honest difference between them.
 *
 * No wholesale ladder either: a combo's price is already the discount, so
 * `price_tiers` stays empty and lineTotal falls back to the flat price.
 */
export function addPromotion(promotion: StorePromotion, quantity = 1): void {
  upsert(
    {
      product_id: 0,
      variant_id: null,
      promotion_id: promotion.id,
      name: promotion.name,
      variant_label: null,
      details: promotion.items
        .map((item) => `${item.product.name} x${item.quantity}`)
        .join(" · "),
      slug: "",
      price: promotion.price,
      kind: "product",
      image_url: promotion.image_url,
      stock: promotion.available_units,
      quantity: 0,
      price_tiers: [],
    },
    quantity,
  );
}

export function setQuantity(line: CartItem, quantity: number): void {
  if (quantity <= 0) {
    removeItem(line);
    return;
  }

  const key = lineKey(line);
  cartItems.set(
    cartItems
      .get()
      .map((item) =>
        lineKey(item) === key
          ? { ...item, quantity: cap(quantity, item.stock) }
          : item,
      ),
  );
}

export function removeItem(line: CartItem): void {
  const key = lineKey(line);
  cartItems.set(cartItems.get().filter((item) => lineKey(item) !== key));
}

export function clearCart(): void {
  cartItems.set([]);
}

export const totalItems = computed(cartItems, (items) =>
  items.reduce((total, item) => total + item.quantity, 0),
);

export const totalAmount = computed(cartItems, (items) =>
  items.reduce((total, item) => total + lineTotal(item), 0),
);
