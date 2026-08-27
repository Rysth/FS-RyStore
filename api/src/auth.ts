import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.ts";
import * as schema from "./db/schema.ts";
import { env, isProduction } from "./config/env.ts";
import { hashPassword, verifyPassword } from "./lib/password.ts";
import { enqueueEmail } from "./jobs/queue.ts";

export const auth = betterAuth({
  appName: env.APP_NAME,
  baseURL: `${env.ADMIN_FRONTEND_URL}`,
  basePath: "/api/v1/auth",
  secret: env.SECRET_KEY_BASE,
  trustedOrigins: env.ADMIN_ALLOWED_ORIGINS,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  user: {
    modelName: "user",
    fields: {
      // better-auth's required `name` lives in the `fullname` column, which is
      // what both the Rails schema and the admin UI already call it.
      name: "fullname",
    },
    additionalFields: {
      username: { type: "string", required: true, input: true },
      phoneNumber: { type: "string", required: false, input: true },
      identification: { type: "string", required: false, input: true },
      closedAt: { type: "date", required: false, input: false },
    },
  },

  session: {
    modelName: "session",
    expiresIn: 60 * 60 * 24 * 14, // 14 days, matching Rodauth's remember_deadline_interval
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
  },

  account: { modelName: "account" },
  verification: { modelName: "verification" },

  // No two-factor plugin: login is a single step for every role. The Rails
  // deployment gated admins behind an emailed OTP; that was dropped here to
  // avoid the hard SMTP dependency at sign-in. The `two_factors` table and
  // `users.two_factor_enabled` column are left in place so it can be restored
  // without a migration.

  advanced: {
    cookiePrefix: "rr",
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      // The admin SPA is served from a different origin than the API, so the
      // session cookie has to survive cross-site requests.
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      httpOnly: true,
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 72, // bcrypt ignores anything past 72 bytes
    autoSignIn: false,
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: async ({ user, token }) => {
      await enqueueEmail({
        type: "reset_password",
        to: user.email,
        url: `${env.ADMIN_FRONTEND_URL}/identity/reset_password?token=${token}`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, token }) => {
      await enqueueEmail({
        type: "verify_account",
        to: user.email,
        url: `${env.ADMIN_FRONTEND_URL}/identity/email_verification?token=${token}`,
      });
    },
  },
});

export type Auth = typeof auth;
export type SessionUser = typeof auth.$Infer.Session.user;
