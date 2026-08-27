import { env } from "../config/env.ts";
import { button, escapeHtml, itemsTable, layout, notice, panel, paragraph } from "./layout.ts";
import { sendMail } from "./mailer.ts";

/**
 * Transactional emails. Subjects and copy are Spanish, carried over from
 * backend/app/views/rodauth_mailer/* and otp_mailer/* — user-facing text in
 * this project is always Spanish (AGENTS.md §3).
 */

const BRAND = env.APP_NAME;

export async function sendVerifyAccountEmail({ to, url }: { to: string; url: string }): Promise<void> {
  const title = "Verifica tu cuenta";
  await sendMail({
    to,
    subject: `Verifica tu cuenta en ${BRAND}`,
    html: layout({
      title,
      preheader: "Confirma tu correo para activar tu cuenta.",
      body:
        paragraph("Gracias por registrarte. Confirma tu correo electrónico para activar tu cuenta.") +
        button(url, "Verificar mi cuenta") +
        paragraph("Si no creaste esta cuenta, puedes ignorar este mensaje.", "muted"),
    }),
    text: `Verifica tu cuenta\n\nGracias por registrarte. Abre este enlace para activar tu cuenta:\n\n${url}\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.`,
  });
}

export async function sendResetPasswordEmail({ to, url }: { to: string; url: string }): Promise<void> {
  const title = "Restablece tu contraseña";
  await sendMail({
    to,
    subject: `Restablece tu contraseña en ${BRAND}`,
    html: layout({
      title,
      preheader: "Crea una nueva contraseña para tu cuenta.",
      body:
        paragraph("Recibimos una solicitud para restablecer tu contraseña.") +
        button(url, "Crear una nueva contraseña") +
        paragraph(
          "Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual seguirá siendo válida.",
          "muted",
        ),
    }),
    text: `Restablece tu contraseña\n\nAbre este enlace para crear una nueva contraseña:\n\n${url}\n\nSi no solicitaste este cambio, ignora este mensaje.`,
  });
}

export async function sendAdminInvitationEmail({
  to,
  fullname,
  url,
}: {
  to: string;
  fullname: string;
  url: string;
}): Promise<void> {
  const title = `Te damos la bienvenida a ${BRAND}`;
  await sendMail({
    to,
    subject: `Te damos la bienvenida a ${BRAND}`,
    html: layout({
      title,
      preheader: "Se ha creado una cuenta para ti. Establece tu contraseña.",
      body:
        paragraph(`Hola ${escapeHtml(fullname)}, se ha creado una cuenta para ti.`) +
        paragraph("Para entrar por primera vez, establece tu contraseña:") +
        button(url, "Establecer mi contraseña"),
    }),
    text: `${title}\n\nHola ${fullname}, se ha creado una cuenta para ti.\n\nEstablece tu contraseña aquí:\n\n${url}`,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Storefront orders
 *
 * These go to the shop owner. The buyer never gets mail: they have no account
 * and no email on file — WhatsApp is their channel.
 * ──────────────────────────────────────────────────────────────────────────── */

export type OrderEmailInput = {
  to: string;
  order: {
    number: string | null;
    customerName: string;
    phone: string;
    address: string | null;
    city: string | null;
    notes: string | null;
    paymentMethod: string;
    paymentMethodLabel: string;
    deliveryMethod: string;
    deliveryMethodLabel: string;
    status: string;
    total: string;
    createdAt: Date;
  };
  items: Array<{
    productName: string;
    variantLabel: string | null;
    details: string | null;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
  shopName: string;
};

const ORDERS_URL = `${env.ADMIN_FRONTEND_URL.replace(/\/$/, "")}/dashboard/orders`;

/** "27/08/2026 a las 14:05" — the format the shop reads on the order list. */
function stamp(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} a las ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function customerRows(order: OrderEmailInput["order"]): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Nombre", escapeHtml(order.customerName)],
    // tel: so the shop can call from the phone it read the email on.
    ["Teléfono", `<a href="tel:${escapeHtml(order.phone)}" style="color:inherit;">${escapeHtml(order.phone)}</a>`],
    ["Entrega", escapeHtml(order.deliveryMethodLabel)],
  ];
  if (order.address) {
    rows.push([
      "Dirección",
      escapeHtml(order.city ? `${order.address}, ${order.city}` : order.address),
    ]);
  }
  rows.push(["Pago", escapeHtml(order.paymentMethodLabel)]);
  if (order.notes) rows.push(["Notas", escapeHtml(order.notes)]);
  return rows;
}

export async function sendNewOrderEmail({
  to,
  order,
  items,
  shopName,
}: OrderEmailInput): Promise<void> {
  const number = order.number ?? "";
  const transfer = order.paymentMethod === "transferencia";

  const lines = items.map((item) => ({
    name: item.productName,
    detail: item.variantLabel ?? item.details,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
  }));

  await sendMail({
    to,
    subject: `Nuevo pedido ${number} por $${order.total}`,
    html: layout({
      title: `🛒 Nuevo pedido ${number}`,
      preheader: `${order.customerName} · $${order.total}`,
      body:
        paragraph(`${escapeHtml(stamp(order.createdAt))} · ${escapeHtml(shopName)}`, "muted") +
        panel("Cliente", customerRows(order)) +
        itemsTable(lines, order.total) +
        (transfer
          ? notice("El cliente eligió transferencia. Te avisaremos de nuevo cuando suba el comprobante.")
          : "") +
        paragraph("El pedido ya está guardado, incluso si el cliente no te escribió por WhatsApp.") +
        button(ORDERS_URL, "Ver pedidos"),
    }),
    text: [
      `NUEVO PEDIDO ${number}`,
      `${stamp(order.createdAt)} - ${shopName}`,
      "",
      "CLIENTE",
      `Nombre: ${order.customerName}`,
      `Teléfono: ${order.phone}`,
      `Entrega: ${order.deliveryMethodLabel}`,
      ...(order.address ? [`Dirección: ${order.city ? `${order.address}, ${order.city}` : order.address}`] : []),
      `Pago: ${order.paymentMethodLabel}`,
      ...(order.notes ? [`Notas: ${order.notes}`] : []),
      "",
      "PRODUCTOS",
      ...items.map(
        (item) =>
          `- ${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ""} x${item.quantity} a $${item.unitPrice} = $${item.subtotal}`,
      ),
      "",
      `TOTAL: $${order.total}`,
      ...(transfer
        ? ["", "El cliente eligió transferencia. Te avisaremos de nuevo cuando suba el comprobante."]
        : []),
      "",
      "El pedido ya está guardado, incluso si el cliente no te escribió por WhatsApp.",
      `Ver pedidos: ${ORDERS_URL}`,
    ].join("\n"),
  });
}

export async function sendPaymentProofEmail({
  to,
  order,
  shopName,
}: Omit<OrderEmailInput, "items">): Promise<void> {
  const number = order.number ?? "";

  // The proof is deliberately neither attached nor linked: object URLs can
  // expire, and this email may well be opened days later.
  const explanation =
    "El cliente subió su comprobante de transferencia. Ábrelo en el panel para verificarlo y confirmar el pedido.";

  await sendMail({
    to,
    subject: `Comprobante recibido — pedido ${number}`,
    html: layout({
      title: "📄 Comprobante recibido",
      preheader: `Pedido ${number} · ${order.customerName}`,
      body:
        paragraph(`Pedido ${escapeHtml(number)} · ${escapeHtml(shopName)}`, "muted") +
        panel(null, [
          ["Cliente", escapeHtml(order.customerName)],
          ["Teléfono", `<a href="tel:${escapeHtml(order.phone)}" style="color:inherit;">${escapeHtml(order.phone)}</a>`],
          ["Total del pedido", `$${escapeHtml(order.total)}`],
          ["Estado actual", escapeHtml(order.status)],
        ]) +
        paragraph(explanation) +
        button(ORDERS_URL, "Revisar el comprobante"),
    }),
    text: [
      "COMPROBANTE RECIBIDO",
      `Pedido ${number} - ${shopName}`,
      "",
      `Cliente: ${order.customerName}`,
      `Teléfono: ${order.phone}`,
      `Total del pedido: $${order.total}`,
      `Estado actual: ${order.status}`,
      "",
      explanation,
      "",
      `Revisar el comprobante: ${ORDERS_URL}`,
    ].join("\n"),
  });
}
