import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.ts";
import { closeDatabase, pool } from "../src/db/client.ts";

/**
 * Auth-flow coverage for the Rodauth replacement.
 *
 * These run against the development database via the app's own routes rather
 * than mocking better-auth, because the things most likely to break are the
 * seams: bcrypt compatibility, the Spanish translation layer, and the
 * admin-only OTP gate.
 */

const ORIGIN = "http://localhost:5173";

let app: FastifyInstance;

async function post(url: string, payload: unknown) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: payload as object,
  });
}

before(async () => {
  app = await buildServer();
  await app.ready();
});

after(async () => {
  await app.close();
  await closeDatabase();
});

describe("mensajes de error en español", () => {
  it("traduce credenciales inválidas y no revela si el correo existe", async () => {
    const response = await post("/api/v1/auth/sign-in/email", {
      email: "operator@example.com",
      password: "contraseña-incorrecta",
    });

    assert.equal(response.statusCode, 401);
    const body = response.json();
    assert.equal(body.message, "Correo electrónico o contraseña incorrectos");
    assert.equal(body.code, "INVALID_EMAIL_OR_PASSWORD");
    assert.equal(body.status, "error");
    assert.equal(body.api_version, "v1");
  });

  it("traduce el bloqueo por cuenta sin verificar", async () => {
    const { rows } = await pool.query<{ email: string }>(
      "SELECT email FROM users WHERE NOT email_verified LIMIT 1",
    );
    const email = rows[0]?.email;
    assert.ok(email, "se esperaba al menos un usuario sin verificar en la base de datos");

    const response = await post("/api/v1/auth/sign-in/email", { email, password: "password123" });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, "EMAIL_NOT_VERIFIED");
    assert.match(response.json().message, /no está verificada/);
  });

  it("traduce una contraseña demasiado corta", async () => {
    const response = await post("/api/v1/auth/sign-up/email", {
      email: `corta-${Date.now()}@example.com`,
      password: "corta",
      name: "Prueba Corta",
      username: `corta_${Date.now()}`,
    });

    assert.equal(response.json().code, "PASSWORD_TOO_SHORT");
    assert.match(response.json().message, /al menos 8 caracteres/);
  });
});

describe("compatibilidad de contraseñas con Rodauth", () => {
  it("acepta un hash bcrypt heredado sin migrarlo", async () => {
    const { rows } = await pool.query<{ prefix: string }>(
      `SELECT left(a.password, 4) AS prefix
         FROM accounts a JOIN users u ON u.id = a.user_id
        WHERE u.email = 'manager@example.com'`,
    );
    assert.match(rows[0]?.prefix ?? "", /^\$2[aby]\$/, "el hash almacenado debe ser bcrypt");

    const response = await post("/api/v1/auth/sign-in/email", {
      email: "manager@example.com",
      password: "password123",
    });

    assert.equal(response.statusCode, 200);
    assert.ok(response.json().token, "se esperaba una sesión");
  });
});

describe("inicio de sesión en un solo paso (sin OTP, AGENTS.md §4)", () => {
  it("un no-admin recibe sesión de inmediato", async () => {
    const response = await post("/api/v1/auth/sign-in/email", {
      email: "manager@example.com",
      password: "password123",
    });

    const body = response.json();
    assert.equal(response.statusCode, 200);
    assert.ok(body.token, "un no-admin debe recibir sesión inmediatamente");
    assert.ok(!body.twoFactorRedirect);
  });

  it("un admin también inicia sesión en un solo paso", async () => {
    const response = await post("/api/v1/auth/sign-in/email", {
      email: "admin@example.com",
      password: "password123",
    });

    const body = response.json();
    assert.equal(response.statusCode, 200);
    assert.ok(body.token, "el OTP se eliminó: el admin recibe sesión directamente");
    assert.ok(!body.twoFactorRedirect);
  });
});

describe("salud y envelope", () => {
  it("responde /up sin sesión", async () => {
    const response = await app.inject({ method: "GET", url: "/up" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
  });

  it("devuelve el envelope del proyecto en rutas inexistentes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/no-existe" });
    assert.equal(response.statusCode, 404);
    const body = response.json();
    assert.equal(body.status, "error");
    assert.equal(body.api_version, "v1");
  });
});
