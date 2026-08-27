import axios from "axios";

/**
 * Every error response from the API carries the project envelope
 * (`{ status, message, errors, api_version }`), so a failed request's message
 * is already Spanish and ready to show. Stores also throw plain `Error`s with
 * a message they built themselves.
 *
 * These helpers cover both without `any`. The codebase used to write
 * `catch (error: any)` and reach into `error.response.data.message`, which
 * silently returns `undefined` — and falls through to the generic fallback —
 * if the shape is ever different.
 */
type ApiErrorBody = {
  message?: string;
  errors?: string[];
};

/** HTTP status of a failed request, or undefined if it never got a response. */
export function apiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** Field-level validation messages (422), empty when there are none. */
export function apiErrorList(error: unknown): string[] {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.errors ?? [];
  }
  return [];
}

/**
 * The one string to show the user for a failed request.
 *
 * The `errors` array wins when the API sent one: on a 422 it holds the
 * specific reason ("El precio desde 12 unidades debe ser menor al del tramo
 * anterior"), while `message` is only the headline ("No se pudo crear el
 * producto"). Showing the headline alone leaves the shop with no idea what to
 * fix.
 *
 * The status branches cover the cases where the body says nothing useful —
 * a proxy 502, a connection that never landed — so no caller has to.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && !axios.isAxiosError(error)) {
    return error.message || fallback;
  }

  if (!axios.isAxiosError<ApiErrorBody>(error)) return fallback;

  const details = apiErrorList(error);
  if (details.length > 0) return details.join(", ");

  const message = error.response?.data?.message;
  if (!error.response) return "Sin conexión. Verifica tu conexión a internet";

  switch (error.response.status) {
    case 401:
      return "Tu sesión ha expirado. Inicia sesión nuevamente";
    case 403:
      return message || "No tienes permiso para realizar esta acción";
    case 404:
      return message || "No se encontró el recurso solicitado";
    case 429:
      return "Demasiadas solicitudes. Espera un momento antes de intentar nuevamente";
    default:
      if (error.response.status >= 500) {
        return "Error del servidor. Intenta nuevamente en unos momentos";
      }
      return message || fallback;
  }
}

/**
 * Message of an error a store threw. Stores already translated the API error
 * through `apiErrorMessage` before re-throwing, so this only unwraps it and
 * supplies a Spanish fallback for anything unexpected.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
