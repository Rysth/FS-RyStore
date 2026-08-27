import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowRight, Loader2, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProductStore } from "../../../stores/productStore";
import type { Product, ProductImage } from "../../../types/store";

// Three photos and one clip is the whole media budget per product; the video
// lives in ProductVideoManager, right below this in the form.
const MAX_IMAGES = 3;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  product: Product;
  onChanged: (product: Product) => void;
}

/**
 * Gallery editor for a saved product.
 *
 * Every action here hits the API immediately rather than waiting for the form's
 * Guardar. Uploads and reorders are their own endpoints — a photo is a file, not
 * a form field — and pretending otherwise would mean holding a batch of images in
 * memory to replay on submit, with nothing to show for it.
 *
 * The main photo is simply the first one, so "make this the main photo" is a
 * reorder. That is also how the server models it: no primary flag to disagree
 * with the order.
 */
export default function ProductGalleryManager({ product, onChanged }: Props) {
  const { uploadProductImages, reorderProductImages, deleteProductImage } =
    useProductStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const images: ProductImage[] = product.images ?? [];
  const room = MAX_IMAGES - images.length;

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

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // Checked here as well as on the server so the shop hears about a wrong file
    // before waiting on an upload.
    const invalid = files.find(
      (file) => !ACCEPTED.includes(file.type) || file.size > 2 * 1024 * 1024,
    );
    if (invalid) {
      toast.error(`"${invalid.name}" debe ser JPG, PNG o WEBP y menor a 2MB`);
      return;
    }
    if (files.length > room) {
      toast.error(
        room > 0
          ? `Solo puedes agregar ${room} imagen${room === 1 ? "" : "es"} más`
          : `Un producto no puede tener más de ${MAX_IMAGES} imágenes`,
      );
      return;
    }

    await run(
      () => uploadProductImages(product.id, files),
      "Error al subir las imágenes",
    );
    // Cleared so picking the same file twice in a row still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function move(index: number, delta: number) {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    void run(
      () => reorderProductImages(product.id, next.map((image) => image.id)),
      "Error al reordenar",
    );
  }

  function makeMain(index: number) {
    if (index === 0) return;
    const next = [images[index], ...images.filter((_, i) => i !== index)];

    void run(
      () => reorderProductImages(product.id, next.map((image) => image.id)),
      "Error al cambiar la imagen principal",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Galería</Label>
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {images.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Sin imágenes en la galería todavía.
        </p>
      ) : (
        <ul className="space-y-2">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2"
            >
              <img
                src={image.url}
                alt={`${product.name} ${index + 1}`}
                className="size-14 shrink-0 rounded-md object-cover"
              />

              <div className="min-w-0 flex-1">
                {index === 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <Star className="size-3 fill-current" />
                    Principal
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => makeMain(index)}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                  >
                    Hacer principal
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Posición {index + 1} de {images.length}
                </p>
              </div>

              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Mover imagen ${index + 1} antes`}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={busy || index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Mover imagen ${index + 1} después`}
                >
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => deleteProductImage(product.id, image.id),
                      "Error al eliminar la imagen",
                    )
                  }
                  aria-label={`Eliminar imagen ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={busy || room <= 0}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mr-1.5 size-3.5" />
        {room > 0 ? "Agregar imágenes" : `Máximo ${MAX_IMAGES} imágenes`}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <p className="text-[11px] text-muted-foreground">
        La principal se usa en el catálogo y al compartir por WhatsApp. Hasta{" "}
        {MAX_IMAGES} fotos, JPG, PNG o WEBP, máximo 2MB cada una.
      </p>
    </div>
  );
}
