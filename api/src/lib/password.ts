import bcrypt from "bcryptjs";

/**
 * Password hashing for better-auth's credential provider.
 *
 * better-auth defaults to scrypt. This project overrides it with bcrypt so
 * that password hashes written by Rodauth (`$2a$12$...`, produced by
 * BCrypt::Password.create(..., cost: 12)) verify unchanged — an existing
 * deployment migrates without forcing anybody to reset their password.
 *
 * bcryptjs is the pure-JS implementation rather than the native `bcrypt`
 * binding: it keeps the production image free of a C toolchain, and at these
 * login volumes (single-tenant, low traffic per AGENTS.md §1) the difference
 * is not measurable.
 */
const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  // bcrypt only considers the first 72 bytes; anything longer is silently
  // truncated by both implementations, so Rodauth-era passwords behave the same.
  return bcrypt.compare(password, hash);
}
