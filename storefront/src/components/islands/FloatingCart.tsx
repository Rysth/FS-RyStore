import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { cartItems, lineKey, totalAmount, totalItems } from "../../lib/cart";
import { cartOpen, closeCart, openCart, stickyCtaVisible } from "../../lib/cartUi";
import { formatPrice } from "../../lib/format";
import { useDrawer } from "../../lib/useDrawer";
import CartLineItem from "./CartLineItem";
import { BagIcon, CloseIcon } from "./icons";

/** Routes where a floating cart button would be redundant or in the way. */
const HIDDEN_ON = ["/carrito", "/checkout"];

/**
 * Fixed cart button plus the slide-in drawer it opens. Mounted once in the
 * layout so it survives every storefront route.
 */
export default function FloatingCart() {
  const items = useStore(cartItems);
  const count = useStore(totalItems);
  const amount = useStore(totalAmount);
  const isOpen = useStore(cartOpen);
  const stickyCta = useStore(stickyCtaVisible);

  const [pathname, setPathname] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPathname(window.location.pathname);

    // View transitions swap the document without a full load, and cartOpen is a
    // nanostore that outlives the swap — so a drawer opened on one page stayed
    // on top of the next one. Every navigation closes it, which also covers the
    // back button and any link added later.
    const onPageLoad = () => {
      setPathname(window.location.pathname);
      closeCart();
    };

    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  useDrawer(isOpen, panelRef, closeCart);

  // The product page's sticky bar claims the bottom of the screen, so the
  // floating button would land on top of it.
  const hideButton = count === 0 || stickyCta || HIDDEN_ON.includes(pathname);

  return (
    <>
      {!hideButton && (
        <button
          type="button"
          onClick={openCart}
          className="fixed right-4 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
          style={{
            backgroundColor: "var(--rystore-primary)",
            // Matches the social rail on the left; keeps the button off the
            // phone's home indicator.
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          }}
          aria-label={`Ver carrito (${count} ${count === 1 ? "artículo" : "artículos"})`}
        >
          <BagIcon className="size-6" />
          <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-xs font-bold text-background">
            {count > 99 ? "99+" : count}
          </span>
        </button>
      )}

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
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold">
            Tu carrito {count > 0 && <span className="text-muted-foreground">({count})</span>}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            className="rounded-full p-2 transition-colors hover:bg-muted"
            aria-label="Cerrar carrito"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {items.length === 0 ? (
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
              {items.map((item) => (
                <CartLineItem key={lineKey(item)} item={item} compact />
              ))}
            </ul>

            <div className="border-t border-border/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatPrice(amount)}</span>
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
