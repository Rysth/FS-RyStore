import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, SignUpForm, SignInForm, PermissionKey } from "../types/auth";
import api from "../utils/api";

/**
 * Session state.
 *
 * The backend answers in Spanish, so this store no longer carries the
 * English-to-Spanish translation tables the Rodauth version needed — it reads
 * `message` off the response envelope and shows it.
 *
 * Authentication is cookie based: there is no token to keep, and `user` is the
 * only thing persisted so a reload can render before /me resolves.
 */

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isLoadingUserInfo: boolean;
  error: string | null;
  register: (data: SignUpForm) => Promise<void>;
  login: (data: SignInForm) => Promise<void>;
  logout: () => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (
    token: string,
    password: string,
    passwordConfirmation: string,
  ) => Promise<void>;
  clearSession: () => void;
  fetchUserInfo: () => Promise<User>;
  updateUser: (user: User) => void;
  validateSession: () => Promise<void>;
  hasPermission: (key: PermissionKey) => boolean;
  hasAnyPermission: (...keys: PermissionKey[]) => boolean;
  hasRole: (role: string) => boolean;
}

const FRONTEND_URL = window.location.origin;

/** Pulls the Spanish message out of an error response, with a sane fallback. */
function messageFrom(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string; errors?: string[] } } })
    .response;

  const firstFieldError = response?.data?.errors?.[0];
  if (firstFieldError) return firstFieldError;

  const message = response?.data?.message;
  if (message) return message;

  if (!response) return "No se pudo conectar con el servidor. Revisa tu conexión.";
  return fallback;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isLoadingUserInfo: false,
      error: null,

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await api.post("/api/v1/auth/sign-up/email", {
            email: data.email,
            password: data.password,
            name: data.fullName,
            username: data.username,
          });
          set({ user: null, isLoading: false });
        } catch (error) {
          const message = messageFrom(error, "No se pudo crear la cuenta");
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      login: async (data) => {
        set({ isLoading: true, error: null });
        try {
          await api.post("/api/v1/auth/sign-in/email", {
            email: data.email,
            password: data.password,
          });

          await get().fetchUserInfo();
          set({ isLoading: false });
        } catch (error) {
          const message = messageFrom(error, "No se pudo iniciar sesión");
          set({ error: message, isLoading: false });
          throw new Error(message);
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          // The previous version only cleared local state, which left the
          // session valid on the server until it expired.
          await api.post("/api/v1/auth/sign-out", {});
        } catch {
          // Even if the call fails, the local session must not survive.
        } finally {
          set({ user: null, isLoading: false, error: null });
        }
      },

      resendVerification: async (email) => {
        try {
          await api.post("/api/v1/auth/send-verification-email", {
            email,
            callbackURL: `${FRONTEND_URL}/identity/email_verification`,
          });
        } catch (error) {
          throw new Error(messageFrom(error, "No se pudo reenviar el correo de verificación"));
        }
      },

      verifyEmail: async (token) => {
        try {
          await api.get("/api/v1/auth/verify-email", { params: { token } });
        } catch (error) {
          throw new Error(messageFrom(error, "El enlace no es válido o ya fue utilizado"));
        }
      },

      requestPasswordReset: async (email) => {
        try {
          await api.post("/api/v1/auth/request-password-reset", {
            email,
            redirectTo: `${FRONTEND_URL}/identity/reset_password`,
          });
        } catch (error) {
          throw new Error(messageFrom(error, "No se pudo enviar el correo de recuperación"));
        }
      },

      resetPassword: async (token, password) => {
        try {
          await api.post("/api/v1/auth/reset-password", { token, newPassword: password });
        } catch (error) {
          throw new Error(messageFrom(error, "El enlace es inválido o ha expirado"));
        }
      },

      fetchUserInfo: async () => {
        set({ isLoadingUserInfo: true });
        try {
          const response = await api.get("/api/v1/me");
          const user: User | undefined = response.data?.user;

          if (!user) throw new Error("No se recibió información del usuario");

          set({ user, isLoadingUserInfo: false });
          return user;
        } catch (error) {
          set({ user: null, isLoadingUserInfo: false });
          throw error;
        }
      },

      validateSession: async () => {
        if (!get().user) return;

        try {
          await get().fetchUserInfo();
        } catch {
          set({ user: null, error: null });
        }
      },

      clearSession: () => set({ user: null, error: null }),

      updateUser: (user) => set({ user }),

      hasPermission: (key) => get().user?.permissions?.includes(key) ?? false,

      hasAnyPermission: (...keys) => {
        const permissions = get().user?.permissions;
        return permissions ? keys.some((key) => permissions.includes(key)) : false;
      },

      hasRole: (role) => get().user?.roles?.includes(role) ?? false,
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
