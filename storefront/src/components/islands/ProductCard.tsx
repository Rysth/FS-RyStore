import { useStore } from "@nanostores/react";
import type { StoreProduct } from "../../types/store";
import { formatPrice } from "../../lib/format";
import { cartItems, addItem, removeItem } from "../../lib/cart";
import { useMounted } from "../../lib/useMounted";

interface Props {
  product: StoreProduct;
}

export default function ProductCard({ product }: Props) {
  const mounted = useMounted();
  const items = useStore(cartItems);
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isService = product.kind === "service";
  const hasVariants = (product.variants?.length ?? 0) > 0;

  const inCart = mounted
    ? items.find(
        (item) =>
          item.promotion_id === null &&
          item.product_id === product.id &&
          item.variant_id == null,
      )
    : undefined;
  const cartQuantity = inCart?.quantity ?? 0;

  function toggleCart(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (hasVariants) {
      window.location.href = `/producto/${product.slug}`;
      return;
    }

    if (cartQuantity > 0) {
      if (inCart) removeItem(inCart);
    } else {
      addItem(product, 1);
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-shadow hover:shadow-md">
      <a href={`/producto/${product.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <svg className="size-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span className="text-[10px] font-medium uppercase tracking-wider opacity-60">Sin foto</span>
            </span>
          )}

          {isOutOfStock && (
            <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-1 text-center text-xs font-medium text-background">
              Agotado
            </span>
          )}
          {isService && !isOutOfStock && (
            <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
              Servicio
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3">
          <h3 className="line-clamp-2 break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]">
            {product.name}
          </h3>

          <div className="mt-auto pt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold">{formatPrice(product.price)}</span>
              {product.compare_at_price && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatPrice(product.compare_at_price)}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={toggleCart}
          disabled={isOutOfStock && !hasVariants}
          className={`inline-flex w-fit items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            hasVariants
              ? "border-border bg-muted text-foreground hover:bg-muted/80"
              : cartQuantity > 0
                ? "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "border-transparent bg-foreground text-background hover:bg-foreground/90"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {hasVariants ? (
            <>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
              Opciones
            </>
          ) : cartQuantity > 0 ? (
            <>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
              Quitar
              {cartQuantity > 1 && <span className="ml-0.5">({cartQuantity})</span>}
            </>
          ) : (
            <>
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              Agregar
            </>
          )}
        </button>
      </div>
    </div>
  );
}
