/**
 * Visible text of an HTML fragment.
 *
 * Used for the meta description and the JSON-LD, where markup would leak into
 * the WhatsApp preview card and Google's rich result. Both of those are built
 * during SSR, so this runs in Node — no DOMParser available.
 *
 * A regex is enough here precisely because the input is not arbitrary: the API
 * sanitizes `description` against Product::DESCRIPTION_TAGS before it is
 * stored, so what arrives is a small, known set of well-formed tags. Do not
 * reach for this to make untrusted HTML safe — it strips tags, it does not
 * sanitize.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
