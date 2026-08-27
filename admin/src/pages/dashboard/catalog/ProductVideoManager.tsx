import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProductStore } from "../../../stores/productStore";
import type { Product } from "../../../types/store";

const MAX_SECONDS = 45;
const MAX_MB = 20;
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

interface Props {
  product: Product;
  onChanged: (product: Product) => void;
}

/**
 * Reads a clip's length in the browser before uploading it.
 *
 * This is where the 45-second rule is actually enforced: the API image ships no
 * ffprobe, so the server can only weigh the file. Doing it here also spares the
 * shop a 20MB upload that was always going to be refused.
 *
 * Resolves to null when the browser cannot decode the file — an unplayable clip
 * is let through to the server, which rejects it on content type instead of the
 * shop being told "45 seconds" about a file that has no duration at all.
 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Video editor for a saved product: one clip, uploaded on the spot. */
export default function ProductVideoManager({ product, onChanged }: Props) {
  const { uploadProductVideo, removeProductVideo } = useProductStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const videoUrl = product.video_url ?? null;

  async function run(action: () => Promise<Product>, failure: string) {
    setBusy(true);
    try {
      onChanged(await action());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    // Cleared up front so picking the same file twice still fires a change
    // event, including after one of the rejections below.
    const clearInput = () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    if (!ACCEPTED.includes(file.type)) {
      toast.error("El video debe ser MP4, WEBM o MOV");
      clearInput();
      return;
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El video debe pesar menos de ${MAX_MB}MB`);
      clearInput();
      return;
    }

    const duration = await readDuration(file);
    if (duration != null && duration > MAX_SECONDS + 0.5) {
      toast.error(
        `El video dura ${Math.round(duration)} segundos; el máximo es ${MAX_SECONDS}`,
      );
      clearInput();
      return;
    }

    await run(() => uploadProductVideo(product.id, file), "Error al subir el video");
    clearInput();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Video</Label>
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {videoUrl ? (
        <div className="space-y-2">
          <video
            src={videoUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-lg border border-border bg-black"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 size-3.5" />
              Cambiar video
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() =>
                void run(
                  () => removeProductVideo(product.id),
                  "Error al eliminar el video",
                )
              }
              aria-label="Eliminar el video del producto"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Video className="size-3.5" />
            Este producto todavía no tiene video.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 size-3.5" />
            Subir video
          </Button>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files)}
      />

      <p className="text-[11px] text-muted-foreground">
        Un solo video por producto, de máximo {MAX_SECONDS} segundos. MP4, WEBM o
        MOV, hasta {MAX_MB}MB. Se muestra junto a las fotos en la ficha del
        producto.
      </p>
    </div>
  );
}
