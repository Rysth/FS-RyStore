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

/** The API's Spanish message, a thrown Error's message, or `fallback`. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Field-level validation messages (422), empty when there are none. */
export function apiErrorList(error: unknown): string[] {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.errors ?? [];
  }
  return [];
}
