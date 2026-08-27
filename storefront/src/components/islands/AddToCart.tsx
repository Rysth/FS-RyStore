import { useEffect, useRef, useState } from "react";
import type { StoreProduct } from "../../types/store";
import { formatPrice } from "../../lib/format";
import { hasTiers, sortedTiers, tierNudge, unitPriceFor } from "../../lib/pricing";
import { addItem } from "../../lib/cart";
import { openCart, setStickyCtaVisible } from "../../lib/cartUi";
import QuantityStepper from "./QuantityStepper";
import { CheckIcon } from "./icons";

interface Props {
  product: StoreProduct;
}

/**
 * Quantity stepper, live tier pricing and the two CTAs.
 *
 * The unit price and the tier table update as the quantity moves — that is what
 * makes "the price recalculates automatically" visible instead of a surprise at
 * checkout.
 */
export default function AddToCart({ product }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [ctaOffScreen, setCtaOffScreen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const ctaRef = useRef<HTMLDivElement>(null);

  const optionTypes = product.option_types || [];
  const variants = product.variants || [];
  const hasVariants = optionTypes.length > 0 && variants.length > 0;
  const selectedVariant = hasVariants
    ? variants.find((variant) =>
        optionTypes.every((axis) => variant.options[axis.name] === selectedOptions[axis.name]),
      ) || null
    : null;
  const effectiveStock = selectedVariant ? selectedVariant.stock : product.stock;
  const effectivePrice = selectedVariant ? selectedVariant.price : product.price;
  const isSelectionComplete = !hasVariants || optionTypes.every((axis) => selectedOptions[axis.name]);
  const isOutOfStock = effectiveStock != null && effectiveStock <= 0;
  const isService = product.kind === "service";

  // On a phone the buyer reads the description and the related products with the
  // buttons long gone, so the bar follows them down. Driven by whether the real
  // CTA row is on screen rather than by a scroll offset, so it stays correct
  // however tall the tier table and the nudge make the block above it.
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || isOutOfStock) return;

    const observer = new IntersectionObserver(
      ([entry]) => setCtaOffScreen(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOutOfStock]);

  // The floating cart button occupies the same corner; it hides while the bar is
  // up. Reset on unmount so leaving the product page brings the button back.
  useEffect(() => {
    setStickyCtaVisible(ctaOffScreen && !isOutOfStock);
    return () => setStickyCtaVisible(false);
  }, [ctaOffScreen, isOutOfStock]);
  const pricedProduct = { ...product, price: effectivePrice };
  const unitPrice = unitPriceFor(pricedProduct, quantity);
  const nudge = tierNudge(pricedProduct, quantity, effectiveStock);
  const tiers = sortedTiers(product);
  const showTable = hasTiers(product);
  const basePrice = Number(product.price) || 0;
  const hasAnchorTier = tiers.some((tier) => Number(tier.min_quantity) <= 1);

  function activeFor(minQuantity: number): boolean {
    const applicable = tiers.filter((tier) => Number(tier.min_quantity) <= quantity);
    const best = applicable[applicable.length - 1];
    return best ? Number(best.min_quantity) === minQuantity : false;
  }

  const baseRowActive = !hasAnchorTier && !tiers.some((t) => Number(t.min_quantity) <= quantity);

  function handleAdd(goToCart: boolean) {
    if (!isSelectionComplete || isOutOfStock) return;

    addItem(product, quantity, selectedVariant);
    if (goToCart) {
      window.location.href = "/checkout";
      return;
    }
    setJustAdded(true);
    openCart();
    window.setTimeout(() => setJustAdded(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{formatPrice(unitPrice)}</span>
          {product.compare_at_price && (
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(product.compare_at_price)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isService ? "Servicio digital" : "Precio por unidad"}
          {quantity > 1 && ` · Total: ${formatPrice(unitPrice * quantity)}`}
        </p>
      </div>

      {isService && (
        <p className="rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          Este servicio se coordina por WhatsApp y se paga por transferencia bancaria.
        </p>
      )}

      {hasVariants && (
        <div className="space-y-3 rounded-2xl border border-border/60 p-4">
          <p className="text-sm font-semibold">Elige tus opciones</p>
          {optionTypes.map((axis) => (
            <div key={axis.name} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{axis.name}</p>
              <div className="flex flex-wrap gap-2">
                {axis.values.map((value) => {
                  const selected = selectedOptions[axis.name] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setSelectedOptions((current) => ({ ...current, [axis.name]: value }));
                        setQuantity(1);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-transparent text-white"
                          : "border-border hover:bg-muted"
                      }`}
                      style={selected ? { backgroundColor: "var(--rystore-primary)" } : undefined}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!isSelectionComplete && (
            <p className="text-xs text-muted-foreground">
              Selecciona todas las opciones para agregar al carrito.
            </p>
          )}
        </div>
      )}

      {showTable && (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <p className="border-b border-border/60 bg-muted/50 px-4 py-2 text-sm font-semibold">
            Precios por mayor
          </p>
          <table className="w-full text-sm">
            <tbody>
              {!hasAnchorTier && (
                <TierRow
                  label="1 unidad"
                  price={basePrice}
                  isActive={baseRowActive}
                />
              )}
              {tiers.map((tier) => (
                <TierRow
                  key={tier.min_quantity}
                  label={
                    Number(tier.min_quantity) <= 1
                      ? "1 unidad"
                      : `Desde ${tier.min_quantity} unidades`
                  }
                  price={Number(tier.unit_price)}
                  isActive={activeFor(Number(tier.min_quantity))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nudge && (
        <p
          className="rounded-xl bg-muted px-4 py-2.5 text-sm font-medium"
          style={{ color: "var(--rystore-primary)" }}
        >
          {nudge}
        </p>
      )}

      {!isSelectionComplete ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
          Selecciona una variante para continuar.
        </p>
      ) : isOutOfStock ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
          Producto agotado por el momento.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
              <QuantityStepper
                quantity={quantity}
                onChange={(next) => setQuantity(Math.max(1, next))}
                max={effectiveStock}
              />
              {effectiveStock != null && (
                <span className="text-xs text-muted-foreground">
                  {effectiveStock} disponibles
                </span>
              )}
          </div>

          <div ref={ctaRef} className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => handleAdd(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ backgroundColor: "var(--rystore-primary)" }}
            >
              {justAdded && <CheckIcon className="size-4" />}
              {justAdded ? "Agregado" : "Agregar al carrito"}
            </button>
            <button
              type="button"
              onClick={() => handleAdd(true)}
              className="flex-1 rounded-full border border-border py-3 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Comprar ahora
            </button>
          </div>

          {/* Phones only: the desktop layout keeps the buttons beside the image,
              where they never leave the viewport. */}
          <div
            className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur transition-transform duration-200 sm:hidden ${
              ctaOffScreen ? "translate-y-0" : "pointer-events-none translate-y-full"
            }`}
            aria-hidden={!ctaOffScreen}
          >
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-base font-bold">{formatPrice(unitPrice * quantity)}</span>
              <span className="text-xs text-muted-foreground">
                {quantity} {quantity === 1 ? "unidad" : "unidades"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleAdd(false)}
                tabIndex={ctaOffScreen ? undefined : -1}
                className="flex flex-[2] items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "var(--rystore-primary)" }}
              >
                {justAdded && <CheckIcon className="size-4" />}
                {justAdded ? "Agregado" : "Agregar al carrito"}
              </button>
              <button
                type="button"
                onClick={() => handleAdd(true)}
                tabIndex={ctaOffScreen ? undefined : -1}
                className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold"
              >
                Comprar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TierRow({
  label,
  price,
  isActive,
}: {
  label: string;
  price: number;
  isActive: boolean;
}) {
  return (
    <tr className={isActive ? "bg-muted/60 font-semibold" : ""}>
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2 text-right">{formatPrice(price)} c/u</td>
    </tr>
  );
}
