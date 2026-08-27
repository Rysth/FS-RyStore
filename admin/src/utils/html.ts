/**
 * Visible text of an HTML fragment, mirroring what Product#description_text
 * does on the server. Used for length validation, so the count the shop sees
 * while typing is the same one the API enforces.
 *
 * Parsed with DOMParser rather than a tag-stripping regex: this runs on markup
 * the editor produced, and a regex would also mangle text that merely looks
 * like a tag.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  const parsed = new DOMParser().parseFromString(html, "text/html");
  return (parsed.body.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * True when a rich text value carries no visible content. An editor the user
 * cleared still reports markup ("<p><br></p>"), which would otherwise be saved
 * as a description and render an empty block in the storefront.
 */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  return htmlToText(html).length === 0;
}
