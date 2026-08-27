import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.ts";
import { closeDatabase, pool } from "../src/db/client.ts";

/**
 * Endpoint coverage for the routes ported in phase 4, exercised through the
 * real router with a real session cookie so authentication, permission gates
 * and serialization are all in the path.
 */

const ORIGIN = "http://localhost:5173";

let app: FastifyInstance;
let managerCookie = "";
let operatorCookie = "";

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sign-in/email",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { email, password: "password123" },
  });

  const cookies = response.cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  assert.ok(cookies, `no se obtuvo cookie de sesión para ${email}`);
  return cookies;
}

const asManager = (url: string) =>
  app.inject({ method: "GET", url, headers: { cookie: managerCookie, origin: ORIGIN } });

before(async () => {
  app = await buildServer();
  await app.ready();
  managerCookie = await signIn("manager@example.com");
  operatorCookie = await signIn("operator@example.com");
});

after(async () => {
  await app.close();
  await closeDatabase();
});

describe("GET /api/v1/me", () => {
  it("devuelve identidad, roles y permisos", async () => {
    const response = await asManager("/api/v1/me");
    assert.equal(response.statusCode, 200);

    const { user } = response.json();
    assert.equal(user.email, "manager@example.com");
    assert.deepEqual(user.roles, ["manager"]);
    assert.equal(user.permissions.length, 18);
    assert.equal(typeof user.id, "string", "los ids son texto tras la migración");
  });

  it("responde 401 sin sesión", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/me" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().message, "No autenticado");
  });
});

describe("GET /api/v1/public/business", () => {
  it("es accesible sin sesión y no expone marcas de tiempo", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/public/business" });
    assert.equal(response.statusCode, 200);

    const { business } = response.json();
    assert.ok(business.name);
    assert.equal(business.created_at, undefined);
  });
});

describe("GET /api/v1/users", () => {
  it("pagina y coincide con el total real", async () => {
    const response = await asManager("/api/v1/users?page=1&per_page=5");
    assert.equal(response.statusCode, 200);

    const body = response.json();
    const { rows } = await pool.query<{ count: string }>("SELECT count(*) FROM users");

    assert.equal(body.pagination.total_count, Number.parseInt(rows[0]!.count, 10));
    assert.equal(body.pagination.per_page, 5);
    assert.ok(body.users.length <= 5);
  });

  it("filtra por rol", async () => {
    const response = await asManager("/api/v1/users?role=operator");
    const body = response.json();

    assert.ok(body.users.length >= 1);
    for (const user of body.users) assert.ok(user.roles.includes("operator"));
  });

  it("busca en nombre, usuario y correo", async () => {
    const response = await asManager("/api/v1/users?search=operator");
    assert.equal(response.json().users.some((u: { username: string }) => u.username === "operator"), true);
  });

  it("rechaza per_page fuera de rango", async () => {
    const response = await asManager("/api/v1/users?per_page=5000");
    assert.equal(response.statusCode, 422);
  });

  it("niega el acceso a un operator", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: operatorCookie, origin: ORIGIN },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().message, "No tienes permiso para realizar esta acción");
  });
});

describe("GET /api/v1/dashboard/stats", () => {
  it("cuadra con los totales de la base de datos", async () => {
    const response = await asManager("/api/v1/dashboard/stats");
    assert.equal(response.statusCode, 200);

    const body = response.json();
    const { rows } = await pool.query<{ total: string; verified: string }>(`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE email_verified AND closed_at IS NULL) AS verified
        FROM users
    `);

    assert.equal(body.stats.total_users, Number.parseInt(rows[0]!.total, 10));
    assert.equal(body.stats.verified_users, Number.parseInt(rows[0]!.verified, 10));
    assert.equal(body.registration_trend.length, 6, "la tendencia cubre seis meses");
    assert.ok(body.recent_users.length <= 5);
  });

  it("es accesible para un operator", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
      headers: { cookie: operatorCookie, origin: ORIGIN },
    });
    assert.equal(response.statusCode, 200);
  });
});

describe("GET /api/v1/permissions", () => {
  it("devuelve las 18 claves y el mapeo por rol", async () => {
    const response = await asManager("/api/v1/permissions");
    const body = response.json();

    assert.equal(body.permissions.length, 18);
    const admin = body.roles.find((role: { name: string }) => role.name === "admin");
    assert.equal(admin.permissions.length, 18);
  });
});

describe("exportación de usuarios", () => {
  it("devuelve un xlsx con nombre de archivo al estilo Rails", async () => {
    const response = await asManager("/api/v1/users/export");

    assert.equal(response.statusCode, 200);
    assert.match(
      response.headers["content-disposition"] as string,
      /attachment; filename="usuarios_\d{8}_\d{6}\.xlsx"/,
    );
    // Every xlsx is a zip; the magic bytes prove it is not an error payload.
    assert.equal(response.rawPayload.subarray(0, 2).toString(), "PK");
  });

  it("niega la exportación a quien no tiene el permiso", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/export",
      headers: { cookie: operatorCookie, origin: ORIGIN },
    });
    assert.equal(response.statusCode, 403);
  });
});

describe("validación de negocio", () => {
  it("rechaza un usuario de Instagram inválido", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/businesses/current",
      headers: { cookie: managerCookie, origin: ORIGIN, "content-type": "application/json" },
      payload: { instagram: "no válido!!" },
    });

    assert.equal(response.statusCode, 422);
    assert.match(response.json().errors[0], /Instagram/);
  });
});
