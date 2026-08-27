import { fromCents, isPositive, toCents } from "../lib/money.ts";
import {
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  type Business,
  type DeliveryMethod,
  type Order,
  type OrderItem,
  type PaymentMethod,
} from "../db/schema.ts";

/**
 * Port of backend/app/services/whatsapp_order_message.rb.
 *
 * Builds the message the buyer sends to the shop. This is the actual checkout:
 * the order row is a record, but the sale happens in WhatsApp, so the wording
 * and the `*bold*` markers are part of the product and not cosmetic.
 */

export type WhatsappOrder = Pick<
  Order,
  | "number"
  | "customerName"
  | "phone"
  | "address"
  | "city"
  | "notes"
  | "paymentMethod"
  | "deliveryMethod"
  | "subtotal"
  | "discountAmount"
  | "total"
> & { couponCode?: string | null };

export type WhatsappItem = Pick<
  OrderItem,
  "productName" | "variantLabel" | "details" | "quantity" | "unitPrice" | "subtotal"
>;

function label<T extends string>(labels: Record<T, string>, value: string): string {
  return labels[value as T] ?? value;
}

export function buildWhatsappMessage(
  order: WhatsappOrder,
  items: WhatsappItem[],
  business: Pick<Business, "name" | "whatsapp">,
): { text: string; url: string | null } {
  const shopName = business.name?.trim() || "MicroBiz";
  const lines: string[] = [];

  lines.push(`*Nuevo pedido ${order.number ?? ""}* - ${shopName}`);
  lines.push("");
  lines.push(`*Cliente:* ${order.customerName}`);
  lines.push(`*Teléfono:* ${order.phone}`);
  lines.push(`*Entrega:* ${label<DeliveryMethod>(DELIVERY_METHOD_LABELS, order.deliveryMethod)}`);

  if (order.deliveryMethod === "domicilio" && order.address) {
    lines.push(`*Dirección:* ${order.address}${order.city ? `, ${order.city}` : ""}`);
  }

  lines.push(`*Pago:* ${label<PaymentMethod>(PAYMENT_METHOD_LABELS, order.paymentMethod)}`);
  lines.push("");
  lines.push("*Productos:*");

  for (const item of items) {
    const variant = item.variantLabel ? ` (${item.variantLabel})` : "";
    lines.push(
      `• ${item.quantity} x ${item.productName}${variant} — $${fromCents(toCents(item.unitPrice))} c/u — $${fromCents(toCents(item.subtotal))}`,
    );
    // Combo contents, indented under their line.
    if (item.details) lines.push(`   ↳ ${item.details}`);
  }

  lines.push("");

  const discount = toCents(order.discountAmount);
  if (isPositive(discount)) {
    lines.push(`Subtotal: $${fromCents(toCents(order.subtotal))}`);
    lines.push(`Cupón ${order.couponCode ?? ""}: -$${fromCents(discount)}`);
  }

  lines.push(`*Total: $${fromCents(toCents(order.total))}*`);

  if (order.notes) {
    lines.push("");
    lines.push(`*Notas:* ${order.notes}`);
  }

  const text = lines.join("\n");
  const digits = (business.whatsapp ?? "").replace(/\D/g, "");
  const url = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;

  return { text, url };
}
