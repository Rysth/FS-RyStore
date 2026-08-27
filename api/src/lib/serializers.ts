import { env } from "../config/env.ts";
import type { Business, User } from "../db/schema.ts";

/**
 * JSON shapes returned to the admin SPA.
 *
 * Field names match what the Rails controllers emitted so the frontend stores
 * keep working, with one deliberate change: `id` is now a string, because
 * better-auth issues text ids rather than bigints.
 */

export type AccountStatus = "verified" | "unverified" | "closed";

/**
 * Rails stored one integer covering all three states. Verified and closed are
 * now separate columns, so the status the UI displays is derived rather than
 * stored — there is no way for the two to disagree.
 */
export function accountStatus(user: Pick<User, "emailVerified" | "closedAt">): AccountStatus {
  if (user.closedAt) return "closed";
  return user.emailVerified ? "verified" : "unverified";
}

export type SerializedUser = {
  id: string;
  fullname: string;
  username: string;
  email: string;
  identification: string | null;
  phone_number: string | null;
  verified: boolean;
  account_status: AccountStatus;
  roles: string[];
  created_at: string;
  updated_at: string;
};

export function serializeUser(user: User, roles: string[]): SerializedUser {
  return {
    id: user.id,
    fullname: user.fullname,
    username: user.username,
    email: user.email,
    identification: user.identification,
    phone_number: user.phoneNumber,
    verified: user.emailVerified && !user.closedAt,
    account_status: accountStatus(user),
    roles,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

/**
 * Rails returned an Active Storage URL. Objects now live in R2 under the key
 * stored on the row, so the public URL is composed directly and no redirect
 * through the API is needed.
 */
export function logoUrl(logoKey: string | null): string {
  return assetUrl(logoKey);
}

/**
 * Public URL for any stored object. Returns "" rather than null so the
 * frontends can drop it straight into a `src` without a guard, which is what
 * the Rails serializers did.
 */
export function assetUrl(key: string | null | undefined): string {
  if (!key) return "";
  const base = env.CLOUDFLARE_PUBLIC_URL?.replace(/\/$/, "");
  return base ? `${base}/${key}` : "";
}

export function serializeBusiness(business: Business) {
  return {
    id: business.id,
    name: business.name,
    // Rails applied these fallbacks in the model (`slogan_or_default`).
    slogan: business.slogan?.trim() ? business.slogan : "Powered by RysthDesign",
    logo_url: logoUrl(business.logoKey),
    whatsapp: business.whatsapp,
    instagram: business.instagram,
    facebook: business.facebook,
    tiktok: business.tiktok,
    created_at: business.createdAt.toISOString(),
    updated_at: business.updatedAt.toISOString(),
  };
}
