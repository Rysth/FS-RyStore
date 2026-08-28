import { useEffect, useRef } from "react";
import { useStore } from "@nanostores/react";
import { cartItems, clearCart, lineKey, totalAmount, totalItems } from "../../lib/cart";
import { cartOpen, closeCart } from "../../lib/cartUi";
import { formatPrice } from "../../lib/format";
import { useDrawer } from "../../lib/useDrawer";
import { useMounted } from "../../lib/useMounted";
import CartLineItem from "./CartLineItem";
import { BagIcon, CloseIcon } from "./icons";

/**
 * The cart drawer. No trigger button of its own — the header's CartBadge and
 * the floating rail's cart button (FloatingRail.tsx) both open it through the
 * shared `cartOpen` store, so this only has to exist once per page and stay
 * out of the way of wherever the trigger actually is.
 */
export default function FloatingCart() {
  const mounted = useMounted();
  const items = useStore(cartItems);
  const count = useStore(totalItems);
  const amount = useStore(totalAmount);
  const isOpen = useStore(cartOpen);
  const visibleItems = mounted ? items : [];
  const visibleCount = mounted ? count : 0;
  const visibleAmount = mounted ? amount : 0;
  const visibleOpen = mounted ? isOpen : false;

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // View transitions swap the document without a full load, and cartOpen is a
    // nanostore that outlives the swap — so a drawer opened on one page stayed
    // on top of the next one. Every navigation closes it, which also covers the
    // back button and any link added later.
    const onPageLoad = () => closeCart();

    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  useDrawer(visibleOpen, panelRef, closeCart);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeCart}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tu carrito"
        tabIndex={-1}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-background shadow-xl outline-none transition-transform duration-200 ${
          visibleOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold">
            Tu carrito {visibleCount > 0 && <span className="text-muted-foreground">({visibleCount})</span>}
          </h2>
          <div className="flex items-center gap-1">
            {visibleItems.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Vaciar carrito
              </button>
            )}
            <button
              type="button"
              onClick={closeCart}
              className="rounded-full p-2 transition-colors hover:bg-muted"
              aria-label="Cerrar carrito"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <BagIcon className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>
            <a
              href="/"
              onClick={closeCart}
              className="rounded-full px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--rystore-primary)" }}
            >
              Ver productos
            </a>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-3 overflow-y-auto p-4">
              {visibleItems.map((item) => (
                <CartLineItem key={lineKey(item)} item={item} compact />
              ))}
            </ul>

            <div className="border-t border-border/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatPrice(visibleAmount)}</span>
              </div>
              <a
                href="/checkout"
                onClick={closeCart}
                className="flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--rystore-primary)" }}
              >
                Ir al checkout
              </a>
              <a
                href="/"
                onClick={closeCart}
                className="mt-2 flex w-full items-center justify-center py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Seguir comprando
              </a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
