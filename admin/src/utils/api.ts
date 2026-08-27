import axios from "axios";
import toast from "react-hot-toast";

/**
 * Single axios instance for the whole app.
 *
 * Authentication is cookie/session based, so requests carry credentials and
 * nothing here touches tokens. The previous version kept a full JWT refresh
 * pipeline — an Authorization interceptor, a queue of requests waiting on a
 * refresh, and calls to /api/v1/auth/token/refresh — but that endpoint never
 * existed in the backend's routes, so the whole path was unreachable.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

/**
 * A FormData body must set its own Content-Type, because the boundary is part
 * of it (`multipart/form-data; boundary=----WebKitFormBoundary...`). The
 * instance default would override it with `application/json` and the server
 * would fail to parse a body it cannot find the parts of — which is what every
 * product image, gallery batch and video upload sends.
 */
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

/**
 * Endpoints that legitimately answer 401 without the session being gone, so a
 * 401 here must not force a logout.
 *
 * update_password is in the list because a wrong *current* password answers
 * 401 (as it did under Rails). Without this entry, mistyping it logs the user
 * straight out — the session is fine, only the supplied password was wrong.
 */
const NON_SESSION_401_PATHS = [
  "/api/v1/auth/sign-in/email",
  "/api/v1/auth/sign-up/email",
  "/api/v1/auth/verify-email",
  "/api/v1/auth/send-verification-email",
  "/api/v1/auth/request-password-reset",
  "/api/v1/auth/reset-password",
  "/api/v1/profile/update_password",
];

const forceLogout = () => {
  localStorage.removeItem("auth-storage");
  window.location.href = "/auth/signin";
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? "";
    const status: number | undefined = error.response?.status;

    if (status === 401 && !NON_SESSION_401_PATHS.some((path) => url.includes(path))) {
      // The session cookie is gone or expired. There is nothing to refresh:
      // the user has to sign in again.
      toast.error("Tu sesión ha expirado. Por favor, inicia sesión de nuevo.");
      forceLogout();
      return Promise.reject(error);
    }

    if (status === 429) {
      toast.error(
        error.response?.data?.message ??
          "Demasiadas solicitudes. Inténtalo de nuevo en unos momentos.",
      );
      return Promise.reject(error);
    }

    if (status !== undefined && status >= 500) {
      toast.error("Ocurrió un error en el servidor. Inténtalo de nuevo más tarde.");
      return Promise.reject(error);
    }

    if (!error.response) {
      toast.error("No se pudo conectar con el servidor. Revisa tu conexión.");
    }

    return Promise.reject(error);
  },
);

export default api;
