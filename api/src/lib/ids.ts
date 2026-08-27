import { randomBytes } from "node:crypto";

/**
 * better-auth-compatible id: 32 characters of base62, the shape better-auth
 * itself issues, so users created by the API, by the Rails migration and by
 * better-auth's own sign-up are indistinguishable downstream.
 */
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateId(): string {
  let id = "";
  for (const byte of randomBytes(32)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}
