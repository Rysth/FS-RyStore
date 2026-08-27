/**
 * Spanish messages for better-auth's error codes.
 *
 * All user-facing text in this project is Spanish (AGENTS.md §3), and
 * better-auth answers in English. Wording is carried over from the Rodauth
 * configuration in backend/app/misc/rodauth_main.rb wherever an equivalent
 * message existed, so the admin UI reads exactly as it did before.
 *
 * Messages deliberately avoid confirming whether an email is registered:
 * INVALID_EMAIL_OR_PASSWORD stays generic to prevent account enumeration.
 */
const MESSAGES: Record<string, string> = {
  // ── Credentials and sessions ──────────────────────────────────────────
  INVALID_EMAIL_OR_PASSWORD: "Correo electrónico o contraseña incorrectos",
  INVALID_PASSWORD: "Contraseña incorrecta",
  INVALID_EMAIL: "Formato de correo electrónico inválido",
  USER_NOT_FOUND: "No existe una cuenta con este correo electrónico",
  USER_EMAIL_NOT_FOUND: "No existe una cuenta con este correo electrónico",
  INVALID_USER: "No existe una cuenta con este correo electrónico",
  ACCOUNT_NOT_FOUND: "No se encontró la cuenta",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta cuenta no tiene una contraseña configurada",
  SESSION_EXPIRED: "Tu sesión ha expirado. Por favor, inicia sesión de nuevo",
  SESSION_NOT_FRESH: "Por seguridad, vuelve a iniciar sesión antes de realizar esta acción",
  FAILED_TO_GET_SESSION: "No se pudo recuperar tu sesión",
  FAILED_TO_CREATE_SESSION: "No se pudo iniciar la sesión",

  // ── Registration ──────────────────────────────────────────────────────
  USER_ALREADY_EXISTS: "Ya existe una cuenta con este correo electrónico",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con este correo electrónico",
  FAILED_TO_CREATE_USER: "No se pudo crear la cuenta",
  FAILED_TO_UPDATE_USER: "No se pudo actualizar la cuenta",
  USER_ALREADY_HAS_PASSWORD: "Esta cuenta ya tiene una contraseña configurada",

  // ── Passwords ─────────────────────────────────────────────────────────
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres",
  PASSWORD_TOO_LONG: "La contraseña no puede superar los 72 caracteres",

  // ── Email verification ────────────────────────────────────────────────
  EMAIL_NOT_VERIFIED:
    "Tu cuenta no está verificada. Por favor, verifica tu correo electrónico antes de iniciar sesión",
  EMAIL_ALREADY_VERIFIED: "Esta cuenta ya está verificada",
  VERIFICATION_EMAIL_NOT_ENABLED: "La verificación por correo no está habilitada",
  FAILED_TO_CREATE_VERIFICATION: "No se pudo generar el enlace de verificación",
  EMAIL_MISMATCH: "El correo electrónico no coincide",
  EMAIL_CAN_NOT_BE_UPDATED: "Este correo electrónico no se puede modificar",
  CHANGE_EMAIL_DISABLED: "El cambio de correo electrónico está deshabilitado",

  // ── Tokens ────────────────────────────────────────────────────────────
  INVALID_TOKEN: "El enlace no es válido o ya fue utilizado",
  TOKEN_EXPIRED: "El enlace ha expirado. Solicita uno nuevo",

  // ── Request validation ────────────────────────────────────────────────
  VALIDATION_ERROR: "Los datos enviados no son válidos",
  MISSING_FIELD: "Falta un campo obligatorio",
  FIELD_NOT_ALLOWED: "Uno de los campos enviados no está permitido",
  INVALID_ORIGIN: "Origen de la solicitud no permitido",
  MISSING_OR_NULL_ORIGIN: "Origen de la solicitud no permitido",
  CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: "Inicio de sesión bloqueado por seguridad",
  INVALID_CALLBACK_URL: "URL de retorno no válida",
  INVALID_REDIRECT_URL: "URL de redirección no válida",
  CALLBACK_URL_REQUIRED: "Falta la URL de retorno",
};

export const FALLBACK_AUTH_ERROR = "No se pudo completar la solicitud. Inténtalo de nuevo";

/**
 * Successful responses can also carry English copy. better-auth returns this
 * one on password-reset requests, worded so it does not reveal whether the
 * address is registered — the Spanish keeps that property.
 */
const SUCCESS_MESSAGES: Record<string, string> = {
  "If this email exists in our system, check your email for the reset link":
    "Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña",
};

export function translateAuthSuccess(message: string | undefined): string | null {
  if (!message) return null;
  return SUCCESS_MESSAGES[message] ?? null;
}

/**
 * Returns the Spanish message for an error code, or null when the code is not
 * mapped — the caller logs those so gaps are visible rather than silent.
 */
export function translateAuthError(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? null;
}

export const AUTH_ERROR_CODES = Object.keys(MESSAGES);
