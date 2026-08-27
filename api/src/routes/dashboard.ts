import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db, pool } from "../db/client.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { ok } from "../lib/response.ts";

/**
 * GET /api/v1/dashboard/stats
 *
 * Ported from Api::V1::DashboardController. The Rails version issued a separate
 * COUNT for every figure — including four inside a six-iteration loop for the
 * registration trend, so roughly twenty round trips per request, which is why
 * it needed a two-minute cache to feel acceptable. Here it is four queries and
 * the cache is gone (see the caching note in the migration plan).
 */

const ROLE_LABELS: Record<string, string> = {
  admin: "Administradores",
  manager: "Gerentes",
  operator: "Operadores",
  user: "Usuarios",
};

const STATUS_LABELS: Record<string, string> = {
  verified: "Verificados",
  unverified: "Sin verificar",
  closed: "Cerrados",
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/dashboard/stats",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_DASHBOARD) },
    async (_request, reply) => {
      // One pass over `users` for every headline figure.
      const totalsQuery = pool.query<{
        total: string;
        verified: string;
        unverified: string;
        closed: string;
        today: string;
        this_week: string;
        this_month: string;
        last_month: string;
      }>(`
        SELECT
          count(*)                                                              AS total,
          count(*) FILTER (WHERE email_verified AND closed_at IS NULL)          AS verified,
          count(*) FILTER (WHERE NOT email_verified AND closed_at IS NULL)      AS unverified,
          count(*) FILTER (WHERE closed_at IS NOT NULL)                         AS closed,
          count(*) FILTER (WHERE created_at >= date_trunc('day', now()))        AS today,
          count(*) FILTER (WHERE created_at >= date_trunc('week', now()))       AS this_week,
          count(*) FILTER (WHERE created_at >= date_trunc('month', now()))      AS this_month,
          count(*) FILTER (WHERE created_at >= date_trunc('month', now()) - interval '1 month'
                             AND created_at <  date_trunc('month', now()))      AS last_month
        FROM users
      `);

      // Every role, including those with no users — Rails did this by starting
      // from `Role.pluck(:name)` and filling in zeros.
      const rolesQuery = pool.query<{ name: string; count: string }>(`
        SELECT r.name, count(ur.user_id) AS count
          FROM roles r
          LEFT JOIN user_roles ur ON ur.role_id = r.id
         GROUP BY r.name
         ORDER BY count DESC, r.name
      `);

      // Six months of registrations in one grouped query instead of a loop.
      const trendQuery = pool.query<{ month: string; total: string; verified: string }>(`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - interval '5 months',
            date_trunc('month', now()),
            interval '1 month'
          ) AS month
        )
        SELECT to_char(m.month, 'YYYY-MM') AS month,
               count(u.id)                                     AS total,
               count(u.id) FILTER (WHERE u.email_verified)      AS verified
          FROM months m
          LEFT JOIN users u ON date_trunc('month', u.created_at) = m.month
         GROUP BY m.month
         ORDER BY m.month
      `);

      const recentQuery = pool.query<{
        id: string;
        fullname: string;
        username: string;
        email: string;
        roles: string[] | null;
        verified: boolean;
        created_at: Date;
      }>(`
        SELECT u.id, u.fullname, u.username, u.email,
               (u.email_verified AND u.closed_at IS NULL) AS verified,
               u.created_at,
               array_remove(array_agg(r.name), NULL) AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT 5
      `);

      const [totalsResult, rolesResult, trendResult, recentResult, counts] = await Promise.all([
        totalsQuery,
        rolesQuery,
        trendQuery,
        recentQuery,
        db
          .select({
            roles: sql<number>`(SELECT count(*)::int FROM roles)`,
            permissions: sql<number>`(SELECT count(*)::int FROM permissions)`,
          })
          .from(sql`(SELECT 1) AS one`),
      ]);

      const totals = totalsResult.rows[0]!;
      const number = (value: string) => Number.parseInt(value, 10);

      const totalUsers = number(totals.total);
      const verifiedUsers = number(totals.verified);
      const thisMonth = number(totals.this_month);
      const lastMonth = number(totals.last_month);

      const growthPercentage =
        lastMonth > 0
          ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10
          : thisMonth > 0
            ? 100
            : 0;

      return ok(reply, {
        stats: {
          total_users: totalUsers,
          verified_users: verifiedUsers,
          unverified_users: number(totals.unverified),
          users_today: number(totals.today),
          users_this_week: number(totals.this_week),
          users_this_month: thisMonth,
          users_last_month: lastMonth,
          growth_percentage: growthPercentage,
          total_roles: counts[0]?.roles ?? 0,
          total_permissions: counts[0]?.permissions ?? 0,
          verification_rate:
            totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 1000) / 10 : 0,
        },
        roles_distribution: rolesResult.rows.map((row) => ({
          name: roleLabel(row.name),
          key: row.name,
          count: number(row.count),
        })),
        account_statuses: (["verified", "unverified", "closed"] as const).map((status) => ({
          status,
          label: STATUS_LABELS[status]!,
          count: number(totals[status]),
        })),
        registration_trend: trendResult.rows.map((row) => {
          const [year, month] = row.month.split("-");
          return {
            date: `${MONTHS_ES[Number.parseInt(month!, 10) - 1]} ${year}`,
            month: row.month,
            total: number(row.total),
            verified: number(row.verified),
          };
        }),
        recent_users: recentResult.rows.map((row) => ({
          id: row.id,
          fullname: row.fullname,
          username: row.username,
          email: row.email,
          roles: row.roles ?? [],
          verified: row.verified,
          created_at: row.created_at.toISOString(),
        })),
      });
    },
  );
}
