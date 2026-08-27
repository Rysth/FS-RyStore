import { atom } from "nanostores";

/**
 * Whether the cart drawer is open. Lives in a store rather than component state
 * because the trigger (header button, floating button) and the drawer itself
 * are separate island roots that share this module instance.
 */
export const cartOpen = atom(false);

export function openCart(): void {
  cartOpen.set(true);
}

export function closeCart(): void {
  cartOpen.set(false);
}

/**
 * Whether a page is showing its own sticky bottom CTA — today the product
 * page's "Agregar al carrito" bar once the real buttons scroll away.
 *
 * Shared for the same reason as cartOpen: AddToCart and FloatingCart are
 * separate islands, and both want the bottom-right corner of a phone screen.
 * The floating cart button steps aside while the bar is up.
 */
export const stickyCtaVisible = atom(false);

export function setStickyCtaVisible(visible: boolean): void {
  stickyCtaVisible.set(visible);
}
