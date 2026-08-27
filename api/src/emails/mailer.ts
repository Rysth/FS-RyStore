import nodemailer from "nodemailer";
import { env, isProduction } from "../config/env.ts";

/**
 * SMTP transport. Reuses the SMTP_* variables the Rails deployment already
 * defines. In development this points at the Mailpit container (UI on :8025),
 * which replaces letter_opener_web.
 */
export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  // Implicit TLS on 465, STARTTLS on 587, plaintext for the dev mail catcher.
  secure: env.SMTP_PORT === 465,
  ...(env.SMTP_USER && env.SMTP_PASSWORD
    ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
    : {}),
  tls: { rejectUnauthorized: isProduction },
});

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  await transporter.sendMail({ from: env.SMTP_FROM, ...mail });
}
