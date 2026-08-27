import { useStore } from "@nanostores/react";
import { stickyCtaVisible } from "../../lib/cartUi";

export interface SocialLink {
  id: string;
  label: string;
  href: string;
  color: string;
}

interface Props {
  links: SocialLink[];
}

/**
 * Floating social links.
 *
 * Left side on purpose: the cart button and the product page's sticky buy bar
 * both own the bottom-right. They render on phones too — around 90% of this
 * product's traffic is mobile, so "hidden below sm" meant hidden from almost
 * everyone — and step aside while the sticky buy bar is up, which spans the full
 * width and would otherwise sit under them.
 */
export default function SocialFloatButtons({ links }: Props) {
  const stickyCta = useStore(stickyCtaVisible);

  if (links.length === 0) return null;

  return (
    <div
      className={`fixed left-4 z-30 flex flex-col items-center gap-2.5 transition-all duration-200 ${
        stickyCta
          ? "pointer-events-none translate-y-4 opacity-0 sm:translate-y-0 sm:opacity-100"
          : "translate-y-0 opacity-100"
      }`}
      // Same offset the cart button uses, so both rails sit on one baseline and
      // both clear the phone's home indicator instead of resting on it.
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
    >
      {links.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
          className="flex size-12 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition-transform active:scale-95 sm:hover:scale-110"
          style={{ backgroundColor: link.color }}
        >
          <svg className="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {link.id === "whatsapp" && (
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.45-.72-2.93-1.16-4.75-4.2-4.9-4.4-.14-.2-1.15-1.53-1.15-2.92 0-1.38.73-2.06 1-2.35.24-.27.53-.34.72-.34s.39 0 .56.01c.17.01.42-.07.65.5.24.58.8 1.96.87 2.1.07.15.12.32.02.51-.1.2-.19.32-.39.5-.19.19-.29.29-.19.58.1.29.44.99 1.02 1.6.66.7 1.31 1.06 1.6 1.2.29.15.46.12.63-.07.17-.2.72-.85.92-1.14.19-.29.39-.24.65-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
            )}
            {link.id === "instagram" && (
              <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.02a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z" />
            )}
            {link.id === "facebook" && (
              <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
            )}
            {link.id === "tiktok" && (
              <path d="M16.6 5.82A4.28 4.28 0 0 0 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.83-2.48V9.77a5.72 5.72 0 1 0 4.92 5.66V8.99a7.03 7.03 0 0 0 4.12 1.33V7.23a4.15 4.15 0 0 1-3.06-1.41Z" />
            )}
          </svg>
        </a>
      ))}
    </div>
  );
}
