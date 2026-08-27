import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  descriptionText,
  normalizeTiers,
  normalizeVariants,
  optionsKey,
  sanitizeDescription,
  validateOptionTypes,
  validateProduct,
  validateTiers,
  validateVariants,
} from "../src/services/products.ts";

/** Pure rules — no database. Ported from product_test.rb and friends. */

describe("descripción", () => {
  it("conserva el formato permitido", () => {
    const clean = sanitizeDescription("<p>Hola <strong>mundo</strong></p>");
    assert.equal(clean, "<p>Hola <strong>mundo</strong></p>");
  });

  it("elimina el script con su contenido, no solo la etiqueta", () => {
    const clean = sanitizeDescription("<p>Hola</p><script>alert('x')</script>");
    assert.equal(clean, "<p>Hola</p>");
    assert.ok(!clean!.includes("alert"));
  });

  it("quita atributos no permitidos", () => {
    const clean = sanitizeDescription('<a href="/x" onclick="hack()">ir</a>');
    assert.ok(clean!.includes('href="/x"'));
    assert.ok(!clean!.includes("onclick"));
  });

  it("una descripción sin texto visible queda en null", () => {
    assert.equal(sanitizeDescription("<p></p><br>"), null);
  });

  it("las etiquetas colapsan a espacio al contar el texto", () => {
    assert.equal(descriptionText("<p>uno</p><p>dos</p>"), "uno dos");
  });
});

describe("escalas de precio", () => {
  const tiers = (rows: Array<[number, string]>) =>
    normalizeTiers(rows.map(([min_quantity, unit_price]) => ({ min_quantity, unit_price })));

  it("acepta una escalera estrictamente decreciente", () => {
    assert.deepEqual(validateTiers(tiers([[6, "9.00"], [12, "8.00"]]), "10.00"), []);
  });

  it("rechaza un tramo más caro que el precio de venta", () => {
    const errors = validateTiers(tiers([[6, "11.00"]]), "10.00");
    assert.ok(errors.includes("El precio desde 6 unidades no puede ser mayor al precio de venta"));
  });

  it("rechaza una escalera que no baja", () => {
    const errors = validateTiers(tiers([[6, "9.00"], [12, "9.00"]]), "10.00");
    assert.ok(errors.includes("El precio desde 12 unidades debe ser menor al del tramo anterior"));
  });

  it("rechaza dos tramos con la misma cantidad mínima", () => {
    const errors = validateTiers(tiers([[6, "9.00"], [6, "8.00"]]), "10.00");
    assert.ok(errors.includes("No puede haber dos escalas con la misma cantidad mínima"));
  });

  it("rechaza más de 8 tramos", () => {
    const many = tiers(Array.from({ length: 9 }, (_, i) => [i + 2, `${9 - i * 0.5}`] as [number, string]));
    assert.ok(validateTiers(many, "10.00").some((e) => e.includes("más de 8 escalas")));
  });

  it("descarta filas completamente vacías", () => {
    assert.deepEqual(normalizeTiers([{ min_quantity: "", unit_price: "" }]), []);
  });

  it("pide completar una fila a medias", () => {
    const errors = validateTiers(normalizeTiers([{ min_quantity: 6, unit_price: "" }]), "10.00");
    assert.deepEqual(errors, ["Completa la cantidad mínima y el precio de cada escala"]);
  });
});

describe("tipos de opción", () => {
  it("acepta dos ejes con valores", () => {
    assert.deepEqual(
      validateOptionTypes([
        { name: "Talla", values: ["S", "M"] },
        { name: "Color", values: ["Negro"] },
      ]),
      [],
    );
  });

  it("exige al menos un valor por eje", () => {
    const errors = validateOptionTypes([{ name: "Talla", values: [] }]);
    assert.ok(errors.includes("Talla necesita al menos un valor"));
  });

  it("rechaza ejes con el mismo nombre", () => {
    const errors = validateOptionTypes([
      { name: "Talla", values: ["S"] },
      { name: "talla", values: ["M"] },
    ]);
    assert.ok(errors.includes("No puede haber dos tipos de opción con el mismo nombre"));
  });

  it("rechaza más de 3 ejes", () => {
    const axes = ["A", "B", "C", "D"].map((name) => ({ name, values: ["x"] }));
    assert.ok(validateOptionTypes(axes).some((e) => e.includes("más de 3 tipos de opción")));
  });
});

describe("variantes", () => {
  const axes = [
    { name: "Talla", values: ["S", "M"] },
    { name: "Color", values: ["Negro"] },
  ];

  it("acepta combinaciones válidas", () => {
    const variants = normalizeVariants([
      { options: { Talla: "S", Color: "Negro" }, stock: 3 },
      { options: { Talla: "M", Color: "Negro" }, stock: 0 },
    ]);
    assert.deepEqual(validateVariants(variants, axes), []);
  });

  it("exige definir exactamente los ejes del producto", () => {
    const variants = normalizeVariants([{ options: { Talla: "S" } }]);
    assert.deepEqual(validateVariants(variants, axes), [
      "La variante debe definir exactamente: Talla, Color",
    ]);
  });

  it("rechaza un valor que no está en el eje", () => {
    const variants = normalizeVariants([{ options: { Talla: "XL", Color: "Negro" } }]);
    assert.ok(validateVariants(variants, axes).includes('"XL" no es un valor válido de Talla'));
  });

  it("rechaza dos variantes con la misma combinación", () => {
    const variants = normalizeVariants([
      { options: { Talla: "S", Color: "Negro" } },
      { options: { Color: "Negro", Talla: "S" } },
    ]);
    assert.ok(validateVariants(variants, axes).includes("Hay dos variantes con la misma combinación"));
  });

  it("no permite variantes sin ejes declarados", () => {
    const variants = normalizeVariants([{ options: { Talla: "S" } }]);
    assert.deepEqual(validateVariants(variants, []), [
      "Un producto sin tipos de opción no puede tener variantes",
    ]);
  });

  it("la clave de combinación no depende del orden de los ejes", () => {
    assert.equal(
      optionsKey({ Talla: "S", Color: "Negro" }),
      optionsKey({ Color: "Negro", Talla: "S" }),
    );
  });

  it("precio y stock vacíos sobreviven como null, no como 0", () => {
    const [variant] = normalizeVariants([{ options: { Talla: "S" }, price: "", stock: "" }]);
    assert.equal(variant!.price, null);
    assert.equal(variant!.stock, null);
  });
});

describe("producto", () => {
  it("exige que el precio de comparación sea mayor al de venta", () => {
    const errors = validateProduct({ price: "10.00", compareAtPrice: "8.00" });
    assert.ok(errors.includes("El precio de comparación debe ser mayor al precio de venta"));
    assert.deepEqual(validateProduct({ price: "10.00", compareAtPrice: "12.00" }), []);
  });

  it("rechaza stock negativo pero acepta null", () => {
    assert.ok(validateProduct({ stock: -1 }).length > 0);
    assert.deepEqual(validateProduct({ stock: null }), []);
  });

  it("rechaza un tipo desconocido", () => {
    assert.deepEqual(validateProduct({ kind: "otra-cosa" }), ["El tipo de producto no es válido"]);
    assert.deepEqual(validateProduct({ kind: "service" }), []);
  });
});
