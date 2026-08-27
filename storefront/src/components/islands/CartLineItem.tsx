import type { CartItem } from "../../types/store";
import { formatPrice } from "../../lib/format";
import { lineTotal, tierNudge, unitPriceFor } from "../../lib/pricing";
import { removeItem, setQuantity } from "../../lib/cart";
import QuantityStepper from "./QuantityStepper";
import { TrashIcon } from "./icons";

interface Props {
  item: CartItem;
  compact?: boolean;
}

/** Shared between the cart page and the drawer so they can't drift apart. */
export default function CartLineItem({ item, compact = false }: Props) {
  const unitPrice = unitPriceFor(item, item.quantity);
  const nudge = tierNudge(item, item.quantity, item.stock);
  // A combo has no page of its own, so its picture and title are not links.
  const href = item.promotion_id ? null : `/producto/${item.slug}`;

  const thumbnail = item.image_url ? (
    <img
      src={item.image_url}
      alt={item.name}
      width="64"
      height="64"
      loading="lazy"
      className="size-16 rounded-xl object-cover"
    />
  ) : (
    <span className="flex size-16 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
      Sin foto
    </span>
  );

  return (
    <li className="flex gap-3 rounded-2xl border border-border/60 bg-card p-3">
      {href ? (
        <a href={href} className="shrink-0">
          {thumbnail}
        </a>
      ) : (
        <span className="shrink-0">{thumbnail}</span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {(() => {
            const title = (
              <>
                {item.name}
                {item.variant_label && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {item.variant_label}
                  </span>
                )}
                {/* What the combo contains, so the buyer can check the line
                    without opening anything. */}
                {item.details && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {item.details}
                  </span>
                )}
              </>
            );

            return href ? (
              <a href={href} className="line-clamp-3 text-sm font-medium hover:underline">
                {title}
              </a>
            ) : (
              <span className="line-clamp-3 text-sm font-medium">{title}</span>
            );
          })()}
          <button
            type="button"
            onClick={() => removeItem(item)}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            aria-label={`Quitar ${item.name} del carrito`}
          >
            <TrashIcon className="size-4" />
          </button>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatPrice(unitPrice)} c/u
        </p>

        {nudge && (
          <p
            className="mt-1.5 rounded-lg bg-muted px-2 py-1 text-xs font-medium"
            style={{ color: "var(--rystore-primary)" }}
          >
            {nudge}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <QuantityStepper
            quantity={item.quantity}
            onChange={(next) => setQuantity(item, next)}
            max={item.stock}
            size={compact ? "sm" : "md"}
            label={`Cantidad de ${item.name}`}
          />
          <span className="text-sm font-semibold">
            {formatPrice(lineTotal(item))}
          </span>
        </div>
      </div>
    </li>
  );
}
