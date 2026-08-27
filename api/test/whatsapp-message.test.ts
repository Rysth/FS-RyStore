import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWhatsappMessage } from "../src/services/whatsapp-message.ts";

/**
 * The message IS the checkout — it is what the buyer sends to the shop — so its
 * shape is a contract, not formatting.
 */

const BUSINESS = { name: "Tienda Demo", whatsapp: "+593 99 912 3456" };

const ORDER = {
  number: "RY-00042",
  customerName: "Ana Pérez",
  phone: "0999123456",
  address: "Av. Amazonas 123",
  city: "Quito",
  notes: null,
  paymentMethod: "efectivo",
  deliveryMethod: "domicilio",
  subtotal: "30.00",
  discountAmount: "0.00",
  total: "30.00",
  couponCode: null,
};

const ITEMS = [
  { productName: "Camiseta", variantLabel: "Talla: M", details: null, quantity: 2, unitPrice: "10.00", subtotal: "20.00" },
  { productName: "Combo Básico", variantLabel: null, details: "Sérum x1 · Crema x2", quantity: 1, unitPrice: "10.00", subtotal: "10.00" },
];

describe("mensaje de WhatsApp", () => {
  it("arma la cabecera, el cliente y los productos", () => {
    const { text } = buildWhatsappMessage(ORDER, ITEMS, BUSINESS);

    assert.match(text, /^\*Nuevo pedido RY-00042\* - Tienda Demo/);
    assert.ok(text.includes("*Cliente:* Ana Pérez"));
    assert.ok(text.includes("*Entrega:* Envío a domicilio"));
    assert.ok(text.includes("*Dirección:* Av. Amazonas 123, Quito"));
    assert.ok(text.includes("*Pago:* Efectivo contra entrega"));
    assert.ok(text.includes("• 2 x Camiseta (Talla: M) — $10.00 c/u — $20.00"));
    assert.ok(text.includes("*Total: $30.00*"));
  });

  it("indenta el contenido del combo bajo su línea", () => {
    const { text } = buildWhatsappMessage(ORDER, ITEMS, BUSINESS);
    assert.ok(text.includes("   ↳ Sérum x1 · Crema x2"));
  });

  it("omite la dirección en un retiro en local", () => {
    const { text } = buildWhatsappMessage(
      { ...ORDER, deliveryMethod: "retiro" },
      ITEMS,
      BUSINESS,
    );
    assert.ok(!text.includes("*Dirección:*"));
    assert.ok(text.includes("*Entrega:* Retiro en local"));
  });

  it("solo muestra subtotal y cupón cuando hubo descuento", () => {
    const sinDescuento = buildWhatsappMessage(ORDER, ITEMS, BUSINESS).text;
    assert.ok(!sinDescuento.includes("Subtotal:"));

    const conDescuento = buildWhatsappMessage(
      { ...ORDER, discountAmount: "3.00", total: "27.00", couponCode: "DEMO10" },
      ITEMS,
      BUSINESS,
    ).text;
    assert.ok(conDescuento.includes("Subtotal: $30.00"));
    assert.ok(conDescuento.includes("Cupón DEMO10: -$3.00"));
    assert.ok(conDescuento.includes("*Total: $27.00*"));
  });

  it("construye el enlace wa.me solo con dígitos", () => {
    const { url } = buildWhatsappMessage(ORDER, ITEMS, BUSINESS);
    assert.ok(url!.startsWith("https://wa.me/593999123456?text="));
  });

  it("sin número de la tienda no hay enlace", () => {
    const { url, text } = buildWhatsappMessage(ORDER, ITEMS, { name: "X", whatsapp: "" });
    assert.equal(url, null);
    assert.ok(text.length > 0, "el texto sigue existiendo para copiarlo a mano");
  });
});
