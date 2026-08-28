import { useRef } from "react";
import type { CSSProperties } from "react";
import type { StoreCategory } from "../../types/store";
import type { CatalogFilters } from "../../lib/catalogFilters";
import type { ProductSort } from "../../lib/api";
import { useDrawer } from "../../lib/useDrawer";
import { CloseIcon } from "./icons";

const SORT_LABELS: Record<ProductSort, string> = {
  recientes: "Más recientes",
  vendidos: "Más vendidos",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
};

interface Props {
  open: boolean;
  onClose: () => void;
  categories: StoreCategory[];
  filters: CatalogFilters;
  onChange: (patch: Partial<CatalogFilters>) => void;
}

/**
 * The catalog's sort/price/category controls, as an actual modal rather than
 * a panel that pushed the grid down the page. Bottom sheet on every
 * breakpoint on purpose: a second "desktop-only" layout would be a second
 * place for these fields to drift apart, for a panel that is open for a few
 * seconds at a time.
 */
export default function FiltersModal({ open, onClose, categories, filters, onChange }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDrawer(open, panelRef, onClose);

  const hasActiveFilters =
    filters.category || filters.sort !== "recientes" || filters.minPrice || filters.maxPrice;

  function clear() {
    onChange({ category: "", sort: "recientes", minPrice: "", maxPrice: "" });
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros"
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-3xl bg-background shadow-xl outline-none transition-transform duration-300 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-2xl ${
          open ? "translate-y-0" : "translate-y-full sm:translate-y-6 sm:opacity-0"
        }`}
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-base font-semibold">Filtros</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-muted"
            aria-label="Cerrar filtros"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {categories.length > 0 && (
            <div>
              <span className="mb-2 block text-xs font-medium text-muted-foreground">Categoría</span>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                <CategoryChip
                  label="Todas"
                  initial="★"
                  isActive={filters.category === ""}
                  onClick={() => onChange({ category: "" })}
                />
                {categories.map((category) => (
                  <CategoryChip
                    key={category.id}
                    label={category.name}
                    initial={category.name.charAt(0).toUpperCase()}
                    imageUrl={category.image_url}
                    isActive={filters.category === category.slug}
                    onClick={() => onChange({ category: category.slug })}
                  />
                ))}
              </div>
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="block text-xs font-medium text-muted-foreground">Ordenar por</span>
            <select
              value={filters.sort}
              onChange={(event) => onChange({ sort: event.target.value as ProductSort })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(SORT_LABELS) as ProductSort[]).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-muted-foreground">Precio desde</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={filters.minPrice}
                onChange={(event) => onChange({ minPrice: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-muted-foreground">Precio hasta</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Sin límite"
                value={filters.maxPrice}
                onChange={(event) => onChange({ maxPrice: event.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clear}
              className="text-xs font-medium underline text-muted-foreground hover:text-foreground"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="border-t border-border/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            Ver resultados
          </button>
        </div>
      </div>
    </>
  );
}

interface ChipProps {
  label: string;
  initial: string;
  imageUrl?: string | null;
  isActive: boolean;
  onClick: () => void;
}

/** Same bones the old category bubbles used, including the image — just living in the modal now instead of a strip that ate the top of every page. */
function CategoryChip({ label, initial, imageUrl, isActive, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="flex flex-col items-center gap-1.5"
    >
      <span
        className={`flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted transition-all ${
          isActive ? "ring-2 ring-offset-2" : ""
        }`}
        style={isActive ? ({ "--tw-ring-color": "var(--rystore-primary)" } as CSSProperties) : undefined}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" width="56" height="56" loading="lazy" className="size-full object-cover" />
        ) : (
          <span
            className="flex size-full items-center justify-center text-sm font-bold text-white"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            {initial}
          </span>
        )}
      </span>
      <span className={`line-clamp-2 text-center text-[11px] leading-tight ${isActive ? "font-semibold" : "text-muted-foreground"}`}>
        {label}
      </span>
    </button>
  );
}
