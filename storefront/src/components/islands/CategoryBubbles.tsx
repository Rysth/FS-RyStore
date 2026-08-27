import type { CSSProperties } from "react";
import type { StoreCategory } from "../../types/store";

interface Props {
  categories: StoreCategory[];
  active: string;
  onSelect: (slug: string) => void;
}

/**
 * Horizontal, touch-scrollable row of circular category shortcuts — the primary
 * navigation on mobile, which is ~90% of this storefront's traffic.
 */
export default function CategoryBubbles({ categories, active, onSelect }: Props) {
  // Fall back to every active category when the shop marked none as featured,
  // so a forgotten setting never leaves the storefront without navigation.
  const featured = categories.filter((category) => category.featured);
  const shown = featured.length > 0 ? featured : categories;

  if (shown.length === 0) return null;

  return (
    <div
      className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
      role="group"
      aria-label="Categorías"
    >
      <Bubble
        label="Todos"
        isActive={active === ""}
        onClick={() => onSelect("")}
        initial="★"
      />

      {shown.map((category) => (
        <Bubble
          key={category.id}
          label={category.name}
          imageUrl={category.image_url}
          isActive={active === category.slug}
          onClick={() => onSelect(category.slug)}
          initial={category.name.charAt(0).toUpperCase()}
        />
      ))}
    </div>
  );
}

interface BubbleProps {
  label: string;
  initial: string;
  imageUrl?: string | null;
  isActive: boolean;
  onClick: () => void;
}

function Bubble({ label, initial, imageUrl, isActive, onClick }: BubbleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="flex shrink-0 snap-start flex-col items-center gap-1.5 pt-1"
      style={{ width: "5rem" }}
    >
      <span
        className={`flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted transition-all sm:size-20 ${
          isActive ? "ring-2 ring-offset-2" : ""
        }`}
        style={
          isActive
            ? ({ "--tw-ring-color": "var(--rystore-primary)" } as CSSProperties)
            : undefined
        }
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            width="80"
            height="80"
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span
            className="flex size-full items-center justify-center text-xl font-bold text-white"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            {initial}
          </span>
        )}
      </span>
      <span
        className={`line-clamp-2 text-center text-xs leading-tight ${
          isActive ? "font-semibold" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
