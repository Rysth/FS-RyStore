import { env } from "../config/env.ts";
import { button, escapeHtml, layout, paragraph } from "./layout.ts";
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
