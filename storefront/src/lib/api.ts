import type {
  CheckoutCustomer,
  CheckoutResult,
  ConfirmedOrder,
  CouponPreview,
  Pagination,
  StoreCategory,
  StoreProduct,
  StorePromotion,
  StoreSettings,
} from "../types/store";

/**
 * Two base URLs on purpose.
 *
 * Server-side rendering talks to the API container directly over the compose
 * network (no CORS, never leaves the host). The browser talks to the API's
 * public hostname. Mixing them breaks in ways that are annoying to debug: an
 * internal URL from an island resolves to nothing in the buyer's browser.
 *
 * The fallback stays "rystore-api" only because that is the default STACK_NAME.
 * On a host running several clients' stacks a wrong guess here is worse than a
 * connection error — it can reach another client's API — so compose always sets
 * API_INTERNAL_URL explicitly and this branch should never be taken.
 */
const INTERNAL_BASE = (
  import.meta.env.API_INTERNAL_URL || "http://rystore-api:3000"
).replace(/\/$/, "");

const PUBLIC_BASE = (import.meta.env.PUBLIC_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface ApiEnvelope {
  status?: string;
  message?: string;
  errors?: string[];
  [key: string]: unknown;
}

/** Turns a failed response into a Spanish message the storefront can show. */
async function toError(response: Response): Promise<ApiError> {
  let body: ApiEnvelope = {};
  try {
    body = (await response.json()) as ApiEnvelope;
  } catch {
    // Non-JSON error page (proxy, gateway); fall through to status mapping.
  }

  const details = Array.isArray(body.errors) ? body.errors : [];
  if (details.length > 0) return new ApiError(details[0], response.status, details);
  if (body.message) return new ApiError(body.message, response.status, details);

  const fallbacks: Record<number, string> = {
    402: "La tienda no está disponible en este momento.",
    403: "La tienda rechazó la solicitud del catálogo. Revisa la configuración del dominio del API.",
    404: "No encontramos lo que buscabas.",
    422: "Revisa los datos e inténtalo de nuevo.",
    429: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    503: "La tienda no está disponible en este momento. Vuelve pronto.",
  };

  return new ApiError(
    fallbacks[response.status] ||
      (response.status >= 500
        ? "La tienda no está disponible en este momento. Inténtalo más tarde."
        : "Ocurrió un error inesperado."),
    response.status,
  );
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError("No pudimos conectarnos con la tienda. Revisa tu conexión.", 0);
  }

  if (!response.ok) {
    const error = await toError(response);
    console.error(`[storefront] ${path} answered ${response.status}: ${error.message}`);
    throw error;
  }

  return (await response.json()) as T;
}

/** Use during SSR only (Astro frontmatter, endpoints). */
export function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(INTERNAL_BASE, path, init);
}

/** Use from React islands only (runs in the buyer's browser). */
export function browserFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(PUBLIC_BASE, path, init);
}

// --- Typed endpoints ---------------------------------------------------

export function fetchSettings(): Promise<{ store: StoreSettings }> {
  return serverFetch("/api/v1/public/store");
}

export function fetchCategories(): Promise<{ categories: StoreCategory[] }> {
  return serverFetch("/api/v1/public/categories");
}

/**
 * The combos the home page features. Already filtered server-side to the ones
 * that are switched on, inside their dates, and still in stock — the storefront
 * renders whatever comes back.
 */
export function fetchPromotions(): Promise<{ promotions: StorePromotion[] }> {
  return serverFetch("/api/v1/public/promotions");
}

/** Order the catalog can be listed in. Anything else falls back to newest-first. */
export type ProductSort = "recientes" | "precio_asc" | "precio_desc" | "vendidos";

export interface ProductListParams {
  category?: string;
  search?: string;
  sort?: ProductSort;
  minPrice?: string;
  maxPrice?: string;
  page?: number;
  perPage?: number;
}

export function productListQuery({
  category,
  search,
  sort,
  minPrice,
  maxPrice,
  page = 1,
  perPage = 12,
}: ProductListParams = {}): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  // "recientes" is the server's default, so leaving it out keeps the URL short.
  if (sort && sort !== "recientes") params.set("sort", sort);
  if (minPrice) params.set("min_price", minPrice);
  if (maxPrice) params.set("max_price", maxPrice);
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  return params.toString();
}

export function fetchProducts(
  params: ProductListParams = {},
): Promise<{ products: StoreProduct[]; pagination: Pagination }> {
  return serverFetch(`/api/v1/public/products?${productListQuery(params)}`);
}

export function fetchProductsFromBrowser(
  params: ProductListParams = {},
): Promise<{ products: StoreProduct[]; pagination: Pagination }> {
  return browserFetch(`/api/v1/public/products?${productListQuery(params)}`);
}

export function fetchProduct(
  slug: string,
): Promise<{ product: StoreProduct; related: StoreProduct[] }> {
  return serverFetch(`/api/v1/public/products/${encodeURIComponent(slug)}`);
}

export function fetchOrder(token: string): Promise<{
  order: ConfirmedOrder;
  whatsapp_message: string;
  whatsapp_url: string | null;
}> {
  return serverFetch(`/api/v1/public/orders/${encodeURIComponent(token)}`);
}

/** A cart line on the wire: a product (with an optional variant) or a combo. */
export type CheckoutLine =
  | { product_id: number; variant_id?: number | null; quantity: number }
  | { promotion_id: number; quantity: number };

export function submitCheckout(
  customer: CheckoutCustomer,
  items: CheckoutLine[],
  couponCode?: string | null,
): Promise<{ order: CheckoutResult; whatsapp_url: string | null }> {
  return browserFetch("/api/v1/public/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order: customer,
      items,
      ...(couponCode ? { coupon_code: couponCode } : {}),
    }),
  });
}

/** Recomputes the cart's price server-side with a coupon applied, without
 * creating an order — same pricing OrderCreator will use at checkout. */
export function validateCoupon(
  code: string,
  items: CheckoutLine[],
): Promise<CouponPreview> {
  return browserFetch("/api/v1/public/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, items }),
  });
}

export function uploadPaymentProof(
  token: string,
  file: File,
): Promise<{ payment_proof_url: string }> {
  const body = new FormData();
  body.append("payment_proof", file);

  // No Content-Type header: the browser must set the multipart boundary.
  return browserFetch(
    `/api/v1/public/orders/${encodeURIComponent(token)}/payment_proof`,
    { method: "POST", body },
  );
}

export function cancelOrder(token: string): Promise<{ order: ConfirmedOrder }> {
  return browserFetch(`/api/v1/public/orders/${encodeURIComponent(token)}/cancel`, {
    method: "POST",
  });
}

export function publicApiUrl(path: string): string {
  return `${PUBLIC_BASE}${path}`;
}
