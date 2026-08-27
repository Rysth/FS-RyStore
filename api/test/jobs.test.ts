import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDatabase, pool } from "../src/db/client.ts";
import { db } from "../src/db/client.ts";
import { sessions, users, verifications } from "../src/db/schema.ts";
import { eq, inArray } from "drizzle-orm";
import {
  cleanupExpiredSessions,
  cleanupExpiredVerifications,
  handleEmail,
} from "../src/jobs/handlers.ts";

/**
 * Job handlers are tested directly rather than through pg-boss: the queue's own
 * delivery guarantees are its business, and going through Postgres would make
 * these slow and order-dependent.
 */

const created: string[] = [];

after(async () => {
  if (created.length > 0) {
    await db.delete(verifications).where(inArray(verifications.id, created));
    await db.delete(sessions).where(inArray(sessions.id, created));
  }
  await closeDatabase();
});

describe("limpieza de verificaciones caducadas", () => {
  it("borra las caducadas y respeta las vigentes", async () => {
    const expiredId = `test-exp-${randomUUID()}`;
    const validId = `test-val-${randomUUID()}`;
    created.push(expiredId, validId);

    await db.insert(verifications).values([
      {
        id: expiredId,
        identifier: expiredId,
        value: "x",
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        id: validId,
        identifier: validId,
        value: "x",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);

    await cleanupExpiredVerifications();

    const remaining = await db
      .select({ id: verifications.id })
      .from(verifications)
      .where(inArray(verifications.id, [expiredId, validId]));

    assert.deepEqual(
      remaining.map((row) => row.id),
      [validId],
      "solo debe sobrevivir la verificación vigente",
    );
  });
});

describe("limpieza de sesiones caducadas", () => {
  it("borra las caducadas y respeta las vigentes", async () => {
    const [user] = await db.select({ id: users.id }).from(users).limit(1);
    assert.ok(user, "se esperaba al menos un usuario");

    const expiredId = `test-ses-exp-${randomUUID()}`;
    const validId = `test-ses-val-${randomUUID()}`;
    created.push(expiredId, validId);

    await db.insert(sessions).values([
      {
        id: expiredId,
        userId: user.id,
        token: expiredId,
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        id: validId,
        userId: user.id,
        token: validId,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);

    await cleanupExpiredSessions();

    const remaining = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.id, [expiredId, validId]));

    assert.deepEqual(remaining.map((row) => row.id), [validId]);
  });
});

describe("despacho de correos", () => {
  it("rechaza un tipo de correo desconocido en vez de fallar en silencio", async () => {
    await assert.rejects(
      // Deliberately invalid: proves the exhaustive switch has a real guard,
      // since a payload can arrive from a queue row written by older code.
      () => handleEmail({ type: "no_existe" } as never),
      /Tipo de correo desconocido/,
    );
  });
});

describe("jobs de Rails no portados", () => {
  it("la consulta de DataCleanupJob no puede ejecutarse contra el esquema real", async () => {
    // DataCleanupJob filtered accounts on `token_expires_at`, a column that has
    // never existed. Documented as a test so nobody "restores" it later.
    await assert.rejects(
      () => pool.query("SELECT 1 FROM users WHERE token_expires_at < now()"),
      /token_expires_at/,
    );
  });
});
