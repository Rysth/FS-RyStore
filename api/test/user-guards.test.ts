import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canChangeRoles,
  canDelete,
  canModify,
  canUnconfirm,
  canView,
  effectiveRoles,
} from "../src/services/user-guards.ts";

/**
 * The rules Rails spread across before_actions in Api::V1::UsersController.
 * Messages are asserted verbatim: they are shown to users in Spanish and a
 * silent reword would be a regression.
 */

const admin = { userId: "u-admin", roles: ["admin"] };
const manager = { userId: "u-manager", roles: ["manager"] };
const operator = { userId: "u-operator", roles: ["operator"] };
const plain = { userId: "u-plain", roles: ["user"] };

describe("canView", () => {
  it("permite ver el propio perfil a cualquiera", () => {
    assert.equal(canView(plain, plain), null);
  });

  it("permite a admin y manager ver a otros", () => {
    assert.equal(canView(admin, plain), null);
    assert.equal(canView(manager, plain), null);
  });

  it("impide a un operator ver a otro usuario", () => {
    assert.deepEqual(canView(operator, plain), {
      message: "No tienes permiso para ver este usuario",
      statusCode: 403,
    });
  });
});

describe("canModify", () => {
  it("solo un admin puede modificar a un admin", () => {
    assert.equal(canModify(admin, admin), null);
    assert.deepEqual(canModify(manager, admin), {
      message: "No tienes permiso para modificar usuarios administradores",
      statusCode: 403,
    });
  });
});

describe("canDelete", () => {
  it("nadie puede eliminarse a sí mismo", () => {
    assert.deepEqual(canDelete(admin, admin), {
      message: "No puedes eliminar tu propio usuario",
      statusCode: 403,
    });
  });

  it("solo un admin elimina a un manager", () => {
    assert.deepEqual(canDelete(manager, { userId: "otro", roles: ["manager"] }), {
      message: "Solo los administradores pueden eliminar usuarios gerentes",
      statusCode: 403,
    });
    assert.equal(canDelete(admin, { userId: "otro", roles: ["manager"] }), null);
  });
});

describe("canUnconfirm", () => {
  it("un no-admin no puede desconfirmar a un admin", () => {
    assert.deepEqual(canUnconfirm(manager, admin), {
      message: "No puedes desconfirmar a un administrador",
      statusCode: 403,
    });
  });

  it("nadie puede desconfirmarse a sí mismo", () => {
    assert.deepEqual(canUnconfirm(admin, admin), {
      message: "No puedes desconfirmar tu propio usuario",
      statusCode: 403,
    });
  });
});

describe("canChangeRoles", () => {
  it("un manager no puede tocar sus propios roles", () => {
    assert.deepEqual(canChangeRoles(manager, manager, ["manager"]), {
      message: "Los gerentes no pueden modificar sus propios roles",
      statusCode: 403,
    });
  });

  it("nadie puede concederse un rol que no tiene", () => {
    assert.deepEqual(canChangeRoles(plain, plain, ["user", "admin"]), {
      message: "No puedes elevar tus propios privilegios",
      statusCode: 403,
    });
  });

  it("conservar los roles propios sin añadir nada está permitido", () => {
    assert.equal(canChangeRoles(plain, plain, ["user"]), null);
  });

  it("un manager no puede quitar el rol manager a otro manager", () => {
    assert.deepEqual(
      canChangeRoles(manager, { userId: "otro", roles: ["manager"] }, ["user"]),
      { message: "Solo los administradores pueden quitar el rol de gerente", statusCode: 403 },
    );
  });

  it("un admin sí puede quitarlo", () => {
    assert.equal(canChangeRoles(admin, { userId: "otro", roles: ["manager"] }, ["user"]), null);
  });
});

describe("effectiveRoles", () => {
  it("descarta el rol admin si quien edita no es admin", () => {
    assert.deepEqual(effectiveRoles(manager, { userId: "otro", roles: [] }, ["user", "admin"]), [
      "user",
    ]);
  });

  it("un admin sí puede conceder admin", () => {
    assert.deepEqual(effectiveRoles(admin, { userId: "otro", roles: [] }, ["admin"]), ["admin"]);
  });

  it("editarse a uno mismo nunca pierde los roles existentes", () => {
    assert.deepEqual(effectiveRoles(admin, admin, []).sort(), ["admin"]);
  });

  it("elimina duplicados", () => {
    assert.deepEqual(
      effectiveRoles(admin, { userId: "otro", roles: [] }, ["user", "user", "manager"]),
      ["user", "manager"],
    );
  });
});
