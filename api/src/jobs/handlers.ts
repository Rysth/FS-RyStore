import { asc, eq, lt } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  orderItems,
  orders,
  sessions,
  verifications,
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
} from "../db/schema.ts";
import type { DeliveryMethod, PaymentMethod } from "../db/schema.ts";
import type { EmailJob, OrderNotificationJob } from "./queue.ts";
import { getBusiness } from "../services/business.ts";
import {
  sendAdminInvitationEmail,
  sendNewOrderEmail,
  sendPaymentProofEmail,
  sendResetPasswordEmail,
  sendVerifyAccountEmail,
} from "../emails/send.ts";

/**
 * Job handlers.
 *
 * Exported plainly so tests can call them without a running queue.
 */

export async function handleEmail(job: EmailJob): Promise<void> {
  switch (job.type) {
    case "verify_account":
      return sendVerifyAccountEmail({ to: job.to, url: job.url });
    case "reset_password":
      return sendResetPasswordEmail({ to: job.to, url: job.url });
    case "admin_invitation":
      return sendAdminInvitationEmail({ to: job.to, fullname: job.fullname, url: job.url });
    default: {
      // Exhaustiveness: adding a variant without a branch fails typecheck.
      const unreachable: never = job;
      throw new Error(`Tipo de correo desconocido: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Tells the shop owner an order arrived, or that its buyer uploaded a receipt.
 *
 * The order is re-read here rather than carried in the payload, so a status
 * change between enqueue and delivery is reflected in the email.
 *
 * Returns quietly — never throws — in the three cases that are not failures:
 * the order was deleted between enqueue and execution, the shop left
 * `notification_email` blank (a deliberate opt-out, not a misconfiguration),
 * or the event name is one this build does not know. Throwing would make
 * pg-boss retry five times over something no retry can fix.
 */
export async function handleOrderNotification(job: OrderNotificationJob): Promise<boolean> {
  const [order] = await db.select().from(orders).where(eq(orders.id, job.orderId)).limit(1);
  if (!order) return false;

  const business = await getBusiness();
  const to = business.notificationEmail?.trim();
  if (!to) {
    console.log(
      `[jobs] notification_email vacío, no se envía aviso del pedido ${order.number ?? order.id}`,
    );
    return false;
  }

  const shopName = business.name?.trim() || "RyStore";
  const payload = {
    to,
    shopName,
    order: {
      number: order.number,
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      city: order.city,
      notes: order.notes,
      paymentMethod: order.paymentMethod,
      paymentMethodLabel:
        PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      deliveryMethodLabel:
        DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod] ?? order.deliveryMethod,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
    },
  };

  switch (job.event) {
    case "new_order": {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
        .orderBy(asc(orderItems.id));
      await sendNewOrderEmail({ ...payload, items });
      return true;
    }
    case "payment_proof":
      await sendPaymentProofEmail(payload);
      return true;
    default:
      console.warn(`[jobs] evento de pedido desconocido: ${JSON.stringify(job.event)}`);
      return false;
  }
}

/**
 * Replaces OtpCleanupJob, which deleted expired rows from `otp_codes`. OTP
 * codes now live in better-auth's `verifications` table alongside email
 * verification and password-reset tokens, all of which expire the same way.
 */
export async function cleanupExpiredVerifications(): Promise<number> {
  const deleted = await db
    .delete(verifications)
    .where(lt(verifications.expiresAt, new Date()))
    .returning({ id: verifications.id });

  return deleted.length;
}

/**
 * Prunes expired sessions. Rails had no equivalent — Rodauth's remember keys
 * were never swept either — but without this the table grows without bound,
 * since better-auth leaves expired rows in place.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  return deleted.length;
}

/**
 * DataCleanupJob and BusinessProcessingJob are deliberately not ported: both
 * referenced things that do not exist (a `token_expires_at` column on accounts,
 * and a `sync_storage` instance method on CloudflareBusinessStorageService), so
 * neither could ever have run successfully. UserExportJob is not ported either
 * — the controller exported synchronously and never enqueued it.
 */
export const NOT_PORTED = ["DataCleanupJob", "BusinessProcessingJob", "UserExportJob"] as const;
