import { useEffect, useRef, useState } from "react";
import { cancelOrder, publicApiUrl } from "../../lib/api";
import { SpinnerIcon } from "./icons";

interface Props {
  token: string;
}

const CANCEL_PATH = (token: string) =>
  `/api/v1/public/orders/${encodeURIComponent(token)}/cancel`;

export default function PendingTransferGuard({ token }: Props) {
  const [open, setOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextHref = useRef<string | null>(null);
  const active = useRef(true);
  const handlingPop = useRef(false);

  useEffect(() => {
    const markComplete = () => {
      active.current = false;
      setOpen(false);
    };

    window.addEventListener("rystore:payment-proof-uploaded", markComplete);
    return () => window.removeEventListener("rystore:payment-proof-uploaded", markComplete);
  }, []);

  useEffect(() => {
    window.history.replaceState({ rystoreTransferGuard: true }, "");
    window.history.pushState({ rystoreTransferGuard: true }, "");

    const onClick = (event: MouseEvent) => {
      if (!active.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;

      const href = link.href;
      if (!href || href === window.location.href) return;

      event.preventDefault();
      nextHref.current = href;
      setOpen(true);
      setError(null);
    };

    const onPopState = () => {
      if (!active.current || handlingPop.current) return;

      handlingPop.current = true;
      window.history.pushState({ rystoreTransferGuard: true }, "");
      handlingPop.current = false;
      nextHref.current = "/";
      setOpen(true);
      setError(null);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!active.current) return;

      event.preventDefault();
      event.returnValue = "";
    };

    const onPageHide = () => {
      if (!active.current) return;

      const url = publicApiUrl(CANCEL_PATH(token));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
        return;
      }

      fetch(url, { method: "POST", keepalive: true }).catch(() => undefined);
    };

    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [token]);

  async function cancelAndLeave() {
    setIsCancelling(true);
    setError(null);

    try {
      await cancelOrder(token);
      active.current = false;
      window.location.href = nextHref.current || "/";
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos cancelar el pedido. Inténtalo de nuevo.",
      );
      setIsCancelling(false);
    }
  }

  function stayHere() {
    nextHref.current = null;
    setOpen(false);
    setError(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-exit-title"
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 shadow-2xl"
      >
        <h2 id="transfer-exit-title" className="text-lg font-bold">
          ¿Cancelar este pedido?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Este pedido por transferencia todavía no tiene comprobante. Si sales
          ahora, lo cancelaremos automáticamente y liberaremos el stock.
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={stayHere}
            disabled={isCancelling}
            className="rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            Seguir subiendo comprobante
          </button>
          <button
            type="button"
            onClick={cancelAndLeave}
            disabled={isCancelling}
            className="flex items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-semibold text-muted-foreground disabled:opacity-60"
          >
            {isCancelling && <SpinnerIcon className="size-4" />}
            {isCancelling ? "Cancelando..." : "Cancelar pedido y salir"}
          </button>
        </div>
      </div>
    </div>
  );
}
