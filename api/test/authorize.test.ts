import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, pool } from "../src/db/client.ts";
import { hasAnyPermission, hasRole, loadAuthorization } from "../src/middleware/authorize.ts";
import { PERMISSION_KEYS, ROLE_DEFAULTS } from "../src/db/seed.ts";

/**
 * RBAC parity with backend/app/controllers/concerns/authorizable.rb and the
 * role/permission table in AGENTS.md §6.
 */

async function userIdFor(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const id = rows[0]?.id;
  assert.ok(id, `no se encontró el usuario ${email}`);
  return id;
}

after(async () => {
  await closeDatabase();
});

describe("resolución de permisos", () => {
  it("un admin obtiene las 9 claves de permiso", async () => {
    const { roles, permissions } = await loadAuthorization(await userIdFor("admin@example.com"));

    assert.deepEqual(roles, ["admin"]);
    assert.equal(permissions.length, 9);
    assert.deepEqual([...permissions].sort(), [...ROLE_DEFAULTS.admin!].sort());
  });

  it("un operator solo obtiene dashboard y perfil", async () => {
    const { permissions } = await loadAuthorization(await userIdFor("operator@example.com"));

    assert.deepEqual(
      [...permissions].sort(),
      [PERMISSION_KEYS.EDIT_PROFILE, PERMISSION_KEYS.VIEW_DASHBOARD].sort(),
    );
  });

  it("un usuario normal solo puede editar su perfil", async () => {
    const { rows } = await pool.query<{ email: string }>(`
      SELECT u.email FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'user' LIMIT 1
    `);
    const email = rows[0]?.email;
    assert.ok(email, "se esperaba al menos un usuario con rol 'user'");

    const { permissions } = await loadAuthorization(await userIdFor(email));
    assert.deepEqual(permissions, [PERMISSION_KEYS.EDIT_PROFILE]);
  });
});

describe("comprobaciones de acceso", () => {
  it("hasAnyPermission aplica semántica OR, como en Rails", async () => {
    const operator = await userIdFor("operator@example.com");

    // Holds the second key but not the first: Rails' authorize_any_permission!
    // passed in exactly this case.
    assert.equal(
      await hasAnyPermission(operator, [PERMISSION_KEYS.DELETE_USERS, PERMISSION_KEYS.EDIT_PROFILE]),
      true,
    );
    assert.equal(
      await hasAnyPermission(operator, [PERMISSION_KEYS.DELETE_USERS, PERMISSION_KEYS.CREATE_USERS]),
      false,
    );
  });

  it("una lista de claves vacía nunca concede acceso", async () => {
    assert.equal(await hasAnyPermission(await userIdFor("admin@example.com"), []), false);
  });

  it("hasRole distingue admin de manager", async () => {
    const manager = await userIdFor("manager@example.com");

    assert.equal(await hasRole(manager, "manager"), true);
    assert.equal(await hasRole(manager, "admin"), false);
  });

  it("un usuario inexistente no tiene permisos ni roles", async () => {
    assert.equal(await hasAnyPermission("no-existe", [PERMISSION_KEYS.EDIT_PROFILE]), false);
    assert.equal(await hasRole("no-existe", "admin"), false);
    assert.deepEqual(await loadAuthorization("no-existe"), { roles: [], permissions: [] });
  });
});
