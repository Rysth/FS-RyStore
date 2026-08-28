import { useRef, useState } from "react";
import type { StorePromotion } from "../../types/store";
import { formatPrice } from "../../lib/format";
import { useDrawer } from "../../lib/useDrawer";
import { CloseIcon, TagIcon } from "./icons";
import PromotionCard from "./PromotionCard";

interface Props {
  promotions: StorePromotion[];
}

/**
 * Combos as a row of circular bubbles — a shortcut, not a sales pitch you
 * have to scroll past. Each one opens a bottom sheet with the full
 * PromotionCard (contents, savings, the "llevar el combo" button) instead of
 * spending grid space on every combo whether the buyer is interested or not.
 */
export default function PromotionBubbles({ promotions }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = promotions.find((promotion) => promotion.id === openId) ?? null;
  const close = () => setOpenId(null);

  // Called unconditionally, before the empty-catalog bail-out below — a hook
  // cannot follow an early return.
  useDrawer(open !== null, panelRef, close);

  if (promotions.length === 0) return null;

  return (
    <>
      <div
        className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
        role="group"
        aria-label="Combos y promociones"
      >
        {promotions.map((promotion) => (
          <PromotionBubble
            key={promotion.id}
            promotion={promotion}
            onClick={() => setOpenId(promotion.id)}
          />
        ))}
      </div>

      {/* Bottom sheet — "ver qué hay dentro" is the whole point of the bubble,
          so it slides up over the page rather than navigating away from it. */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={open ? open.name : "Combo"}
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col rounded-t-3xl bg-background shadow-xl outline-none transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold">Detalle del combo</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 transition-colors hover:bg-muted"
            aria-label="Cerrar"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {open && <PromotionCard promotion={open} embedded />}
        </div>
      </div>
    </>
  );
}

interface BubbleProps {
  promotion: StorePromotion;
  onClick: () => void;
}

function PromotionBubble({ promotion, onClick }: BubbleProps) {
  const soldOut = promotion.available_units != null && promotion.available_units <= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 snap-start flex-col items-center gap-1.5 pt-1"
      style={{ width: "5.5rem" }}
    >
      <span className="relative flex size-16 items-center justify-center sm:size-20">
        {/* The invite-to-click cue. A sold-out combo is still worth opening
            (to see if a part of it is buyable alone), but doesn't need to
            beg for the tap. */}
        {!soldOut && (
          <span
            className="combo-invite absolute inset-0 rounded-full"
            style={{ backgroundColor: "var(--rystore-primary)" }}
            aria-hidden="true"
          />
        )}

        <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-muted ring-2 ring-background">
          {promotion.image_url ? (
            <img
              src={promotion.image_url}
              alt=""
              width="80"
              height="80"
              loading="lazy"
              className={`size-full object-cover ${soldOut ? "opacity-50" : ""}`}
            />
          ) : (
            <span
              className="flex size-full items-center justify-center text-white"
              style={{ backgroundColor: soldOut ? "var(--muted-foreground)" : "var(--rystore-primary)" }}
            >
              <TagIcon className="size-7" />
            </span>
          )}
        </span>

        {promotion.discount_percent > 0 && !soldOut && (
          <span className="absolute -top-1 -right-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background shadow-sm">
            -{promotion.discount_percent}%
          </span>
        )}
      </span>

      <span className="line-clamp-2 text-center text-xs font-medium leading-tight">
        {promotion.name}
      </span>
      <span className="text-xs font-semibold" style={{ color: "var(--rystore-primary)" }}>
        {soldOut ? "Agotado" : formatPrice(promotion.price)}
      </span>
    </button>
  );
}
