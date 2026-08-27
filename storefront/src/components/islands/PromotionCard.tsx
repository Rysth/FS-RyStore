import { useState } from "react";
import type { StorePromotion, StoreProduct } from "../../types/store";
import { formatPrice } from "../../lib/format";
import { addItem, addPromotion } from "../../lib/cart";
import { openCart } from "../../lib/cartUi";
import { CheckIcon, PlusIcon } from "./icons";

interface Props {
  promotion: StorePromotion;
}

/**
 * One combo on the home page.
 *
 * Two ways to buy, on purpose: the big button takes the whole bundle at the
 * combo price, and every product in it also carries its own "+" that adds just
 * that one at list price. A buyer who only wants the cream should not have to
 * take the serum to get at it.
 *
 * A product with options has no "+": there is nowhere here to ask which size,
 * so its row links to the product page instead. (The server refuses to put such
 * a product in a combo, so this is a guard, not a common case.)
 */
export default function PromotionCard({ promotion }: Props) {
  const [added, setAdded] = useState<string | null>(null);

  const savings = Number(promotion.savings);
  const soldOut = promotion.available_units != null && promotion.available_units <= 0;
  const lastFew =
    promotion.available_units != null &&
    promotion.available_units > 0 &&
    promotion.available_units <= 3;

  function flash(key: string) {
    setAdded(key);
    window.setTimeout(() => setAdded((current) => (current === key ? null : current)), 1600);
    openCart();
  }

  function takeCombo() {
    addPromotion(promotion, 1);
    flash("combo");
  }

  function takeProduct(product: StoreProduct) {
    addItem(product, 1);
    flash(`product:${product.id}`);
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {promotion.image_url ? (
          <img
            src={promotion.image_url}
            alt={promotion.name}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Sin foto
          </span>
        )}

        {promotion.discount_percent > 0 && (
          <span
            className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            -{promotion.discount_percent}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-1 text-center text-xs font-medium text-background">
            Agotado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-base font-semibold leading-snug">{promotion.name}</h3>
          {promotion.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {promotion.description}
            </p>
          )}
        </div>

        <ul className="space-y-1.5 border-y border-border/60 py-2.5">
          {promotion.items.map(({ product, quantity }) => {
            const hasOptions = (product.option_types?.length ?? 0) > 0;
            const key = `product:${product.id}`;

            return (
              <li key={product.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">{quantity} x </span>
                  <a href={`/producto/${product.slug}`} className="hover:underline">
                    {product.name}
                  </a>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatPrice(product.price)}
                </span>

                {hasOptions ? (
                  <a
                    href={`/producto/${product.slug}`}
                    className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    Elegir
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => takeProduct(product)}
                    className="shrink-0 rounded-full border border-border p-1.5 transition-colors hover:bg-muted"
                    aria-label={`Agregar ${product.name} por separado`}
                    title="Agregar solo este producto"
                  >
                    {added === key ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <PlusIcon className="size-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-auto space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">{formatPrice(promotion.price)}</span>
            {savings > 0 && (
              <span className="text-xs text-muted-foreground line-through">
                {formatPrice(promotion.regular_total)}
              </span>
            )}
          </div>
          {savings > 0 && (
            <p className="text-xs font-medium" style={{ color: "var(--rystore-primary)" }}>
              Ahorras {formatPrice(savings)} llevando el combo
            </p>
          )}
          {lastFew && (
            <p className="text-xs text-muted-foreground">
              Quedan {promotion.available_units} combos
            </p>
          )}

          <button
            type="button"
            onClick={takeCombo}
            disabled={soldOut}
            className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            {added === "combo" ? (
              <>
                <CheckIcon className="size-4" />
                Agregado
              </>
            ) : (
              "Llevar el combo"
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
