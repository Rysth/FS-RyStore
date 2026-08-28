import { useStore } from "@nanostores/react";
import { totalItems } from "../../lib/cart";
import { openCart } from "../../lib/cartUi";
import { useMounted } from "../../lib/useMounted";
import { BagIcon } from "./icons";

/** Header cart button. Opens the same drawer as the floating button. */
export default function CartBadge() {
  const mounted = useMounted();
  const count = useStore(totalItems);
  const visibleCount = mounted ? count : 0;

  return (
    <button
      type="button"
      onClick={openCart}
      className="relative flex size-10 items-center justify-center rounded-full transition-colors hover:bg-muted"
      aria-label={`Ver carrito (${visibleCount} ${visibleCount === 1 ? "artículo" : "artículos"})`}
    >
      <BagIcon className="size-5" />
      {visibleCount > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          {visibleCount > 99 ? "99+" : visibleCount}
        </span>
      )}
    </button>
  );
}
