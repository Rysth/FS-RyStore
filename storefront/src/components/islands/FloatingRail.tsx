import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { totalItems } from "../../lib/cart";
import { openCart, stickyCtaVisible } from "../../lib/cartUi";
import { BagIcon, TagIcon, WhatsAppIcon } from "./icons";

interface Props {
  whatsappNumber: string;
  hasPromotions: boolean;
  /**
   * `Astro.url.pathname` from the server, seeding the first paint so the
   * Ofertas button doesn't flash on /carrito or /checkout before the
   * astro:page-load listener below has a chance to correct it. Only the seed:
   * transition:persist keeps this whole component mounted across soft
   * navigations, so it is the listener — not a fresh prop — that tracks the
   * route from here on.
   */
  pathname: string;
}

/** Routes where the cart trigger is redundant — you're already looking at it. */
const CART_HIDDEN_ON = ["/carrito", "/checkout"];
/** The buying flow doesn't need another offer competing for the tap. */
const OFFERS_HIDDEN_ON = ["/carrito", "/checkout"];

/**
 * The bottom-right stack: combos shortcut, WhatsApp, cart — all on one rail so
 * they never collide. Each one is independently optional (no combos, no
 * WhatsApp number, an empty cart), so the container is a plain flex column
 * with a gap; whichever buttons are present just stack, no hand-placed offsets
 * to keep in sync.
 *
 * This owns only the *triggers*. The cart drawer itself is FloatingCart,
 * mounted separately and opened through the shared `cartUi` store — same split
 * the header's CartBadge already used.
 */
export default function FloatingRail({ whatsappNumber, hasPromotions, pathname: initialPathname }: Props) {
  const count = useStore(totalItems);
  const stickyCta = useStore(stickyCtaVisible);
  const [pathname, setPathname] = useState(initialPathname);

  useEffect(() => {
    const onPageLoad = () => setPathname(window.location.pathname);
    document.addEventListener("astro:page-load", onPageLoad);
    return () => document.removeEventListener("astro:page-load", onPageLoad);
  }, []);

  const showOffers = hasPromotions && !OFFERS_HIDDEN_ON.includes(pathname);
  const showCart = count > 0 && !CART_HIDDEN_ON.includes(pathname);

  if (!showOffers && !whatsappNumber && !showCart) return null;

  return (
    <div
      className={`fixed right-4 z-30 flex flex-col items-end gap-3 transition-all duration-200 ${
        stickyCta
          ? "pointer-events-none translate-y-4 opacity-0 sm:translate-y-0 sm:opacity-100"
          : "translate-y-0 opacity-100"
      }`}
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
    >
      {showOffers && (
        <a
          href="/#combos"
          className="flex items-center gap-1.5 rounded-full py-2.5 pl-3 pr-4 text-xs font-semibold text-white shadow-lg ring-1 ring-black/5 transition-transform active:scale-95 sm:hover:scale-105"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          <TagIcon className="size-4" />
          Ofertas
        </a>
      )}

      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escríbenos por WhatsApp"
          title="Escríbenos por WhatsApp"
          className="flex size-12 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition-transform active:scale-95 sm:hover:scale-110"
          style={{ backgroundColor: "#25D366" }}
        >
          <WhatsAppIcon className="size-6" />
        </a>
      )}

      {showCart && (
        <button
          type="button"
          onClick={openCart}
          className="relative flex size-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
          style={{ backgroundColor: "var(--rystore-primary)" }}
          aria-label={`Ver carrito (${count} ${count === 1 ? "artículo" : "artículos"})`}
        >
          <BagIcon className="size-6" />
          <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border-2 border-background bg-foreground px-1 text-xs font-bold text-background">
            {count > 99 ? "99+" : count}
          </span>
        </button>
      )}
    </div>
  );
}
