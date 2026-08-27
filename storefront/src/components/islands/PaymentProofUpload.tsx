import { useEffect, useRef, useState } from "react";
import { uploadPaymentProof } from "../../lib/api";
import { CheckIcon, SpinnerIcon, UploadIcon } from "./icons";

interface Props {
  token: string;
  bankInstructions: string | null;
  existingProofUrl: string | null;
  /** ISO timestamp the server recorded; the 30-minute window counts from it. */
  createdAt: string;
  whatsappUrl: string | null;
}

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;
/** How long the buyer has to transfer before the shop stops holding the order. */
const WINDOW_MINUTES = 30;

function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Bank details, the transfer window, the receipt upload and the WhatsApp
 * handoff — in that order, because that is the order the buyer does them in.
 *
 * The account number lives here rather than in the checkout: it is only useful
 * once an order exists to reconcile the payment against, and the countdown has
 * to start from a timestamp the server recorded, not from when someone opened a
 * form.
 */
export default function PaymentProofUpload({
  token,
  bankInstructions,
  existingProofUrl,
  createdAt,
  whatsappUrl,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingProofUrl);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const deadline = new Date(createdAt).getTime() + WINDOW_MINUTES * 60_000;
  const [msLeft, setMsLeft] = useState(() => deadline - Date.now());

  // Ticks only while the window is open and nothing has been uploaded yet —
  // once either is settled the number stops meaning anything.
  useEffect(() => {
    if (uploadedUrl || msLeft <= 0) return;

    const timer = window.setInterval(() => {
      setMsLeft(deadline - Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, uploadedUrl, msLeft <= 0]);

  const expired = msLeft <= 0;

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    setError(null);
    if (!selected) return;

    if (!ACCEPTED.includes(selected.type)) {
      setError("El comprobante debe ser una imagen JPG, PNG, WEBP o un PDF.");
      return;
    }
    if (selected.size > MAX_SIZE) {
      setError("El comprobante debe pesar menos de 5MB.");
      return;
    }

    setFile(selected);

    if (selected.type === "application/pdf") {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  }

  async function handleUpload() {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const { payment_proof_url } = await uploadPaymentProof(token, file);
      setUploadedUrl(payment_proof_url);
      setFile(null);
      window.dispatchEvent(new CustomEvent("rystore:payment-proof-uploaded"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pudimos subir el comprobante. Inténtalo de nuevo.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">Paga tu pedido</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tu pedido ya está registrado. Haz la transferencia y sube el
          comprobante para enviarlo a la tienda.
        </p>
      </div>

      {bankInstructions && (
        <div className="rounded-xl bg-muted p-3">
          <p className="mb-1 text-xs font-semibold">Datos para la transferencia</p>
          <p className="whitespace-pre-line text-xs leading-relaxed">
            {bankInstructions}
          </p>
        </div>
      )}

      {!uploadedUrl &&
        (expired ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Pasaron los {WINDOW_MINUTES} minutos para transferir. Puedes subir el
            comprobante igual, pero confirma con la tienda por WhatsApp que aún
            tiene stock reservado.
          </p>
        ) : (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs">
            Tienes{" "}
            <span className="font-semibold tabular-nums">
              {formatCountdown(msLeft)}
            </span>{" "}
            para hacer la transferencia y subir el comprobante.
          </p>
        ))}

      {uploadedUrl ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
          <CheckIcon className="size-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">¡Comprobante recibido!</p>
            <a
              href={uploadedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline"
            >
              Ver comprobante
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              setUploadedUrl(null);
              setPreview(null);
            }}
            className="shrink-0 text-xs text-muted-foreground underline"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center transition-colors hover:border-foreground/30"
          >
            {preview ? (
              <img
                src={preview}
                alt="Vista previa del comprobante"
                className="max-h-40 rounded-lg object-contain"
              />
            ) : file ? (
              <>
                <CheckIcon className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">{file.name}</p>
              </>
            ) : (
              <>
                <UploadIcon className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">Toca para subir tu comprobante</p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WEBP o PDF · máx. 5MB
                </p>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleSelect}
            className="hidden"
          />

          {file && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--rystore-primary)" }}
            >
              {isUploading && <SpinnerIcon className="size-4" />}
              {isUploading ? "Subiendo..." : "Subir comprobante"}
            </button>
          )}
        </>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The handoff waits for the receipt: sending the order first is what let
          a buyer message the shop with nothing to check, and WhatsApp links
          cannot carry the file itself — only this page can. The message points
          the shop back here, where the receipt already is. */}
      {whatsappUrl &&
        (uploadedUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--rystore-primary)" }}
          >
            Enviar pedido por WhatsApp
          </a>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-full bg-muted py-3 text-sm font-semibold text-muted-foreground"
            >
              Enviar pedido por WhatsApp
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Se habilita cuando subas el comprobante.
            </p>
          </div>
        ))}
    </section>
  );
}
