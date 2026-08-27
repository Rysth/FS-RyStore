import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignField, truthy, unwrap } from "../src/lib/multipart.ts";
import { booleanInput } from "../src/lib/validation.ts";

/**
 * The admin's FormData uses Rails bracket notation (`category[name]`), which
 * Rack expanded for free. Here it is explicit, and without it every multipart
 * save fails with "El nombre es requerido" while the JSON path works — a bug
 * that only shows up once a shop attaches an image.
 */

describe("campos de multipart", () => {
  it("expande la notación de corchetes a un objeto anidado", () => {
    const fields: Record<string, unknown> = {};
    assignField(fields, "category[name]", "Bebidas");
    assignField(fields, "category[active]", "true");

    assert.deepEqual(fields, { category: { name: "Bebidas", active: "true" } });
    assert.deepEqual(unwrap(fields, "category"), { name: "Bebidas", active: "true" });
    assert.equal(truthy((fields.category as Record<string, unknown>).active), true);
  });

  it("deja los campos sin corchetes en la raíz", () => {
    const fields: Record<string, unknown> = {};
    assignField(fields, "category[name]", "Bebidas");
    assignField(fields, "remove_image", "true");

    assert.equal(fields.remove_image, "true");
    assert.deepEqual(fields.category, { name: "Bebidas" });
  });

  it("acumula un sufijo [] en un array", () => {
    const fields: Record<string, unknown> = {};
    assignField(fields, "images[]", "a");
    assignField(fields, "images[]", "b");

    assert.deepEqual(fields.images, ["a", "b"]);
  });

  it("un campo repetido sin corchetes también se acumula", () => {
    const fields: Record<string, unknown> = {};
    assignField(fields, "tag", "uno");
    assignField(fields, "tag", "dos");

    assert.deepEqual(fields.tag, ["uno", "dos"]);
  });

  it("anida más de un nivel", () => {
    const fields: Record<string, unknown> = {};
    assignField(fields, "product[variants][sku]", "AB-1");

    assert.deepEqual(fields, { product: { variants: { sku: "AB-1" } } });
  });

  it("unwrap acepta también el payload plano", () => {
    assert.deepEqual(unwrap({ name: "Suelto" }, "category"), { name: "Suelto" });
  });
});

describe("booleanos que llegan por multipart", () => {
  it('"false" es falso — z.coerce.boolean() lo habría hecho verdadero', () => {
    assert.equal(booleanInput.parse("false"), false);
    assert.equal(booleanInput.parse("0"), false);
    assert.equal(booleanInput.parse(""), false);
    assert.equal(booleanInput.parse("no"), false);
  });

  it("acepta las formas afirmativas que mandan los formularios", () => {
    for (const value of ["true", "1", "on", "yes", "TRUE", " true "]) {
      assert.equal(booleanInput.parse(value), true, value);
    }
  });

  it("respeta los booleanos y números reales del payload JSON", () => {
    assert.equal(booleanInput.parse(true), true);
    assert.equal(booleanInput.parse(false), false);
    assert.equal(booleanInput.parse(1), true);
    assert.equal(booleanInput.parse(0), false);
  });
});
