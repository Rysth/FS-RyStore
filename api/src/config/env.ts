import { z } from "zod";

/**
 * Environment contract. Validated once at boot so a misconfigured deployment
 * fails immediately and loudly instead of at the first request that needs the
 * missing value.
 *
 * Variable names are kept identical to the Rails deployment wherever one
 * already exists, so `.env` files on client servers keep working untouched.
 */
const csv = z
  .string()
  .transform((value) =>
    value
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),

  // Session signing / encryption secret. Reuses Rails' SECRET_KEY_BASE so an
  // existing deployment does not need a new variable.
  SECRET_KEY_BASE: z.string().min(32, "SECRET_KEY_BASE debe tener al menos 32 caracteres"),

  // Brand name shown in transactional email (subjects, header, footer) and as
  // the better-auth appName. Set it per deployment to rebrand without touching
  // code.
  APP_NAME: z.string().default("R&R Template"),

  ADMIN_FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  ADMIN_ALLOWED_ORIGINS: csv.default("http://localhost:5173"),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("no-reply@example.com"),

  CLOUDFLARE_ENDPOINT: z.string().optional(),
  CLOUDFLARE_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_BUCKET_NAME: z.string().optional(),
  CLOUDFLARE_PUBLIC_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Configuración de entorno inválida:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
