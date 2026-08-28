import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Pagination, StoreCategory, StoreProduct } from "../../types/store";
import { fetchProductsFromBrowser, type ProductSort } from "../../lib/api";
import {
  filtersFromQuery,
  type CatalogFilters,
} from "../../lib/catalogFilters";
import {
  filtersOpen,
  searchQuery,
  setActiveFilterCount,
} from "../../lib/catalogUi";
import ProductCard from "./ProductCard";
import { SpinnerIcon } from "./icons";

// Filters are held as one object rather than five useStates: they are always
// applied, synced to the URL and sent to the API as a set, and threading five
// arguments through load(), syncUrl() and the popstate handler is how that kind
// of thing drifts out of step.
const SORT_LABELS: Record<ProductSort, string> = {
  recientes: "Más recientes",
  vendidos: "Más vendidos",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
};

interface Props {
  categories: StoreCategory[];
  initialProducts: StoreProduct[];
  initialPagination: Pagination;
  initialFilters: CatalogFilters;
}

/**
 * Hydrates with the products the server already rendered (so the first paint is
 * indexable HTML), then filters client-side. The URL is kept in sync with
 * pushState, so `?categoria=aretes` stays shareable and the back button works.
 */
export default function Catalog({
  categories,
  initialProducts,
  initialPagination,
  initialFilters,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [pagination, setPagination] = useState(initialPagination);
  const [filters, setFilters] = useState(initialFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFiltersOpen = useStore(filtersOpen);

  // Skip the fetch on mount: the server already gave us page 1.
  const isFirstRender = useRef(true);
  const requestId = useRef(0);

  const load = useCallback(
    async (next: CatalogFilters, page: number) => {
      const id = ++requestId.current;
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchProductsFromBrowser({
          category: next.category || undefined,
          search: next.search || undefined,
          sort: next.sort,
          minPrice: next.minPrice || undefined,
          maxPrice: next.maxPrice || undefined,
          page,
        });
        // Ignore a slow response that a newer request already superseded.
        if (id !== requestId.current) return;

        setProducts(data.products);
        setPagination(data.pagination);
      } catch (caught) {
        if (id !== requestId.current) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "No pudimos cargar los productos.",
        );
      } finally {
        if (id === requestId.current) setIsLoading(false);
      }
    },
    [],
  );

  // Spanish query keys, because these URLs get shared: /?categoria=labios&orden=precio_asc
  //
  // `replace` is for text being typed: pushing an entry per keystroke would mean
  // "aretes" costs six presses of the back button to leave the page. The URL
  // still ends up shareable, it just stops being a keystroke log.
  function syncUrl(next: CatalogFilters, replace = false) {
    const params = new URLSearchParams();
    if (next.category) params.set("categoria", next.category);
    if (next.search) params.set("buscar", next.search);
    if (next.sort !== "recientes") params.set("orden", next.sort);
    if (next.minPrice) params.set("desde", next.minPrice);
    if (next.maxPrice) params.set("hasta", next.maxPrice);
    const query = params.toString();
    const url = query ? `/?${query}` : "/";

    if (replace) window.history.replaceState(next, "", url);
    else window.history.pushState(next, "", url);
  }

  // Keep the grid in step with the back/forward buttons.
  useEffect(() => {
    const onPopState = () => {
      const next = filtersFromQuery(window.location.search);
      setFilters(next);
      searchQuery.set(next.search);
      load(next, 1);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [load]);

  // The search input lives in the header, a separate island, so its value
  // arrives through the store instead of as a prop.
  const headerSearch = useStore(searchQuery);

  // Seed the store from the URL the server rendered, so a shared
  // /?buscar=aretes shows its term in the header box.
  useEffect(() => {
    searchQuery.set(initialFilters.search);
  }, [initialFilters.search]);

  useEffect(() => {
    if (filters.search === headerSearch) return;

    const next = { ...filters, search: headerSearch };
    setFilters(next);
    syncUrl(next, true);
    // Only the store drives this; `filters` is read fresh on each run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerSearch]);

  // Debounced as a set: the price inputs are typed into like the search box, and
  // a sort or category tap simply arrives 300ms later, which nobody notices.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = window.setTimeout(() => load(filters, 1), 300);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  function update(patch: Partial<CatalogFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    syncUrl(next);
  }

  function handlePage(page: number) {
    load(filters, page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Published so the header's Filtros badge counts the same things this panel
  // does, rather than re-deriving the rule on the other side of the store.
  useEffect(() => {
    setActiveFilterCount(
      (filters.category ? 1 : 0) +
        (filters.sort !== "recientes" ? 1 : 0) +
        (filters.minPrice ? 1 : 0) +
        (filters.maxPrice ? 1 : 0),
    );
  }, [filters.category, filters.sort, filters.minPrice, filters.maxPrice]);

  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="space-y-5">
      {isFiltersOpen && (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Categoría</span>
            <select
              value={filters.category}
              onChange={(event) => update({ category: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Ordenar por</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                update({ sort: event.target.value as ProductSort })
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(SORT_LABELS) as ProductSort[]).map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Precio desde</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={filters.minPrice}
              onChange={(event) => update({ minPrice: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Precio hasta</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Sin límite"
              value={filters.maxPrice}
              onChange={(event) => update({ maxPrice: event.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          {(filters.category ||
            filters.sort !== "recientes" ||
            filters.minPrice ||
            filters.maxPrice) && (
            <button
              type="button"
              onClick={() =>
                update({ category: "", sort: "recientes", minPrice: "", maxPrice: "" })
              }
              className="justify-self-start text-xs underline text-muted-foreground hover:text-foreground sm:col-span-4"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No encontramos productos con esos filtros.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        // Stacked directly above the cart button and optically centred on it:
        // 48px at right-5 shares a centre line with the cart's 56px at right-4.
        style={{ bottom: "calc(5.375rem + env(safe-area-inset-bottom))" }}
        className={`fixed right-5 z-40 flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all duration-200 ${
          showBackToTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
        aria-label="Ir arriba"
      >
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>

      {pagination.total_pages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Paginación">
          <button
            type="button"
            onClick={() => handlePage(pagination.current_page - 1)}
            disabled={pagination.current_page <= 1 || isLoading}
            className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 text-sm text-muted-foreground">
            {pagination.current_page} de {pagination.total_pages}
          </span>
          <button
            type="button"
            onClick={() => handlePage(pagination.current_page + 1)}
            disabled={pagination.current_page >= pagination.total_pages || isLoading}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {isLoading && <SpinnerIcon className="size-4" />}
            Siguiente
          </button>
        </nav>
      )}
    </div>
  );
}
