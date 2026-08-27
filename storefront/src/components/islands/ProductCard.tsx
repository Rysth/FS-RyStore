import type { StoreProduct } from "../../types/store";
import { formatPrice } from "../../lib/format";

interface Props {
  product: StoreProduct;
}

export default function ProductCard({ product }: Props) {
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isService = product.kind === "service";

  return (
    <a
      href={`/producto/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-shadow hover:shadow-md"
    >
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
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>

        {/* The wholesale ladder is deliberately not shown here: in a grid it
            competes with the price and makes two cards look like four numbers.
            It belongs on the detail page, where AddToCart can show the whole
            ladder next to the quantity stepper that unlocks it. */}
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
  );
}
