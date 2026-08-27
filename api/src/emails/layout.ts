/**
 * Shared HTML shell for transactional email. Ported from
 * backend/app/views/layouts/mailer.html.erb, then rebuilt for real-world mail
 * clients: a full-width background table (Outlook ignores `<body>` styles), an
 * MSO ghost table so the card keeps its width in Outlook, a VML "bulletproof"
 * button, and a hidden preheader for the inbox preview line.
 *
 * Inline styles only — clients discard <style> blocks and external CSS.
 * Palette mirrors the admin auth theme (admin/src/index.css `.auth-theme`).
 */
import { env } from "../config/env.ts";

const BRAND = env.APP_NAME;

const COLORS = {
  page: "#f4f4f8",
  card: "#ffffff",
  border: "#e4e4e8",
  text: "#08080c",
  bodyText: "#3f3f46",
  muted: "#8a8a99",
  accent: "#2563eb",
} as const;

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type ShellInput = {
  /** Goes in <title> and as the <h1> at the top of the card. */
  title: string;
  /** Hidden inbox-preview text. Keep it short and specific. */
  preheader: string;
  /** Pre-rendered inner HTML (use the helpers below). */
  body: string;
};

export function layout({ title, preheader, body }: ShellInput): string {
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(title)}</title>
<!--[if mso]>
<style>table,td,div,p,a,h1{font-family:Arial,Helvetica,sans-serif !important;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${COLORS.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLORS.page};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
<tr>
<td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr>
<td style="padding:0 8px 20px;">
<span style="font-size:16px;font-weight:700;color:${COLORS.text};letter-spacing:-0.01em;">${escapeHtml(BRAND)}</span>
</td>
</tr>
<tr>
<td style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;padding:36px 32px;">
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.35;font-weight:700;color:${COLORS.text};font-family:${FONT_STACK};">${escapeHtml(title)}</h1>
${body}
</td>
</tr>
<tr>
<td style="padding:22px 8px 0;">
<p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};font-family:${FONT_STACK};">Este es un mensaje automático de ${escapeHtml(BRAND)}. No respondas a este correo.</p>
<p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};font-family:${FONT_STACK};">&copy; ${year} ${escapeHtml(BRAND)}</p>
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>`;
}

/** Body paragraph. `tone: "muted"` for the small print under the main message. */
export function paragraph(text: string, tone: "body" | "muted" = "body"): string {
  const style =
    tone === "muted"
      ? `margin:0 0 4px;font-size:13px;line-height:1.6;color:${COLORS.muted};`
      : `margin:0 0 14px;font-size:15px;line-height:1.65;color:${COLORS.bodyText};`;
  return `<p style="${style}font-family:${FONT_STACK};">${text}</p>`;
}

/** Bulletproof CTA button (renders in Outlook via VML). */
export function button(url: string, label: string): string {
  const href = escapeAttr(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
<tr>
<td align="center" bgcolor="${COLORS.accent}" style="border-radius:10px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:280px;" arcsize="22%" strokecolor="${COLORS.accent}" fillcolor="${COLORS.accent}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(label)}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${href}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${COLORS.accent};font-family:${FONT_STACK};">${escapeHtml(label)}</a>
<!--<![endif]-->
</td>
</tr>
</table>
<p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${COLORS.muted};font-family:${FONT_STACK};">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
<p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;font-family:${FONT_STACK};"><a href="${href}" style="color:${COLORS.accent};text-decoration:underline;">${escapeHtml(url)}</a></p>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
