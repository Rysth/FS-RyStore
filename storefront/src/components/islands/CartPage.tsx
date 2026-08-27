import { useStore } from "@nanostores/react";
import { cartItems, lineKey, totalAmount } from "../../lib/cart";
import { formatPrice } from "../../lib/format";
import CartLineItem from "./CartLineItem";
import { BagIcon } from "./icons";

export default function CartPage() {
  const items = useStore(cartItems);
  const amount = useStore(totalAmount);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
        <BagIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Tu carrito está vacío.</p>
        <a
          href="/"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          Ver productos
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ul className="space-y-3">
        {items.map((item) => (
          <CartLineItem key={lineKey(item)} item={item} />
        ))}
      </ul>

      <aside className="h-fit space-y-4 rounded-2xl border border-border/60 bg-card p-4 lg:sticky lg:top-20">
        <h2 className="text-base font-semibold">Resumen</h2>

        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatPrice(amount)}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          El envío se coordina por WhatsApp una vez confirmado el pedido.
        </p>

        <a
          href="/checkout"
          className="flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--rystore-primary)" }}
        >
          Continuar al checkout
        </a>
        <a
          href="/"
          className="flex w-full items-center justify-center py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Seguir comprando
        </a>
      </aside>
    </div>
  );
}
