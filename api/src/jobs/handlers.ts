import { lt, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { sessions, verifications } from "../db/schema.ts";
import type { EmailJob } from "./queue.ts";
import {
  sendAdminInvitationEmail,
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
