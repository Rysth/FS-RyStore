import { useEffect, type RefObject } from "react";

/**
 * Modal drawer behaviour: lock the page behind it, close on Escape, keep Tab
 * inside it, and hand focus back on the way out.
 *
 * Extracted when the info drawer appeared, so the two panels cannot drift into
 * behaving differently — a buyer who can Tab out of one modal but not the other
 * is a bug nobody reports and everybody feels.
 */
export function useDrawer(
  isOpen: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
    // onClose is called, never compared: including it would re-run the effect
    // (and so re-take focus) on every parent render that passes a new closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, panelRef]);
}
