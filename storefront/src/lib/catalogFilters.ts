import type { ProductSort } from "./api";

/** Everything that narrows the catalog grid. */
export interface CatalogFilters {
  category: string;
  search: string;
  sort: ProductSort;
  minPrice: string;
  maxPrice: string;
}

const SORTS: ProductSort[] = [
  "recientes",
  "vendidos",
  "precio_asc",
  "precio_desc",
];

export const EMPTY_FILTERS: CatalogFilters = {
  category: "",
  search: "",
  sort: "recientes",
  minPrice: "",
  maxPrice: "",
};

/**
 * Reads filters out of a query string.
 *
 * Shared by the server render and the browser's popstate handler so a filtered
 * URL means the same thing whether it was pasted, shared, or arrived at with the
 * back button — the whole reason the keys are in the URL at all.
 *
 * The keys are Spanish because these links get shared:
 * /?categoria=labios&orden=precio_asc&desde=5
 */
export function filtersFromQuery(query: string | URLSearchParams): CatalogFilters {
  const params =
    typeof query === "string" ? new URLSearchParams(query) : query;

  const sort = params.get("orden") || "";

  return {
    category: params.get("categoria") || "",
    search: params.get("buscar") || "",
    // An unknown value falls back rather than being passed through, matching how
    // the API treats it.
    sort: SORTS.includes(sort as ProductSort)
      ? (sort as ProductSort)
      : "recientes",
    minPrice: sanitizeAmount(params.get("desde")),
    maxPrice: sanitizeAmount(params.get("hasta")),
  };
}

/**
 * Keeps a hand-edited URL from putting junk into a number input, which would
 * render as an empty box the buyer cannot explain.
 */
function sanitizeAmount(value: string | null): string {
  if (!value) return "";

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "";
  return String(amount);
}
