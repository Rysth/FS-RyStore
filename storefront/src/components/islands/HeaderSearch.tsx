import { useStore } from "@nanostores/react";
import {
  activeFilterCount,
  filtersOpen,
  searchQuery,
  setSearchQuery,
  toggleFilters,
} from "../../lib/catalogUi";

interface Props {
  /** Rendered into the header, so it gets an id the mobile layout can focus. */
  inputId?: string;
  /** Adds the sort/price toggle beside the input. */
  showFilters?: boolean;
  className?: string;
}

/**
 * The catalog search box — and optionally the filters toggle — living in the
 * header instead of above the grid. Writes to the shared store; Catalog reads
 * it and refetches.
 */
export default function HeaderSearch({
  inputId,
  showFilters = false,
  className = "",
}: Props) {
  const value = useStore(searchQuery);
  const isOpen = useStore(filtersOpen);
  const count = useStore(activeFilterCount);

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div className="relative min-w-0 flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar productos..."
          aria-label="Buscar productos"
          className="w-full rounded-full border border-border bg-muted/50 py-2 pl-9 pr-4 text-sm outline-none focus:border-transparent focus:ring-2"
          style={{ ["--tw-ring-color" as string]: "var(--rystore-primary)" }}
        />
      </div>

      {showFilters && (
        <button
          type="button"
          onClick={toggleFilters}
          aria-expanded={isOpen}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium"
        >
          Filtros
          {count > 0 && (
            <span
              className="flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: "var(--rystore-primary)" }}
            >
              {count}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
