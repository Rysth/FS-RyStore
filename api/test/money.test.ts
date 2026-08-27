import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addCents,
  clampAtZero,
  fromCents,
  minCents,
  multiplyCents,
  percentOfCents,
  subtractCents,
  toCents,
} from "../src/lib/money.ts";

/**
 * These are the cases that separate cents arithmetic from floating point. Every
 * one of them is wrong under `parseFloat`, and each maps to a real path: a cart
 * subtotal, a percentage coupon, a price tier.
 */

describe("toCents / fromCents", () => {
  it("lee lo que devuelve Postgres para numeric(10,2)", () => {
    assert.equal(toCents("12.50"), 1250n);
    assert.equal(toCents("0.00"), 0n);
    assert.equal(toCents("1999.99"), 199999n);
    assert.equal(toCents("7"), 700n);
    assert.equal(toCents("7.5"), 750n);
  });

  it("trata null, undefined y vacío como cero", () => {
    assert.equal(toCents(null), 0n);
    assert.equal(toCents(undefined), 0n);
    assert.equal(toCents("  "), 0n);
  });

  it("redondea el tercer decimal alejándose de cero", () => {
    assert.equal(toCents("0.005"), 1n);
    assert.equal(toCents("0.004"), 0n);
    assert.equal(toCents("-0.005"), -1n);
  });

  it("da la vuelta al string original", () => {
    for (const value of ["0.00", "12.50", "1999.99", "0.05", "-3.40"]) {
      assert.equal(fromCents(toCents(value)), value);
    }
  });

  it("rechaza lo que no es un importe", () => {
    assert.throws(() => toCents("abc"), TypeError);
    assert.throws(() => toCents("12,50"), TypeError);
  });
});

describe("suma y multiplicación", () => {
  it("no arrastra el error de 0.1 + 0.2", () => {
    assert.equal(fromCents(addCents(toCents("0.10"), toCents("0.20"))), "0.30");
    // El equivalente en punto flotante da 0.30000000000000004.
    assert.notEqual(0.1 + 0.2, 0.3);
  });

  it("suma un carrito largo sin derivar", () => {
    const line = toCents("19.99");
    const total = addCents(...Array.from({ length: 100 }, () => line));
    assert.equal(fromCents(total), "1999.00");
  });

  it("multiplica por la cantidad de forma exacta", () => {
    assert.equal(fromCents(multiplyCents(toCents("19.99"), 3)), "59.97");
    assert.equal(fromCents(multiplyCents(toCents("0.07"), 7)), "0.49");
  });

  it("exige cantidades enteras", () => {
    assert.throws(() => multiplyCents(toCents("1.00"), 1.5), TypeError);
  });
});

describe("porcentajes de cupón", () => {
  it("aplica un porcentaje entero", () => {
    assert.equal(fromCents(percentOfCents(toCents("100.00"), 10)), "10.00");
    assert.equal(fromCents(percentOfCents(toCents("59.97"), 15)), "9.00");
  });

  it("aplica un porcentaje con decimales", () => {
    assert.equal(fromCents(percentOfCents(toCents("100.00"), "12.5")), "12.50");
  });

  it("redondea a la mitad alejándose de cero", () => {
    // 33.33 * 10% = 3.333 -> 3.33
    assert.equal(fromCents(percentOfCents(toCents("33.33"), 10)), "3.33");
    // 0.35 * 50% = 0.175 -> 0.18
    assert.equal(fromCents(percentOfCents(toCents("0.35"), 50)), "0.18");
  });
});

describe("topes", () => {
  it("un descuento nunca supera el subtotal", () => {
    const subtotal = toCents("20.00");
    const discount = minCents(toCents("50.00"), subtotal);
    assert.equal(fromCents(subtractCents(subtotal, discount)), "0.00");
  });

  it("clampAtZero evita totales negativos", () => {
    assert.equal(fromCents(clampAtZero(toCents("-5.00"))), "0.00");
    assert.equal(fromCents(clampAtZero(toCents("5.00"))), "5.00");
  });
});
