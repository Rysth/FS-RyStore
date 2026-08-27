import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface Props {
  images: string[];
  /** The product's clip, if it has one. Shown as the last item in the gallery. */
  video?: string | null;
  name: string;
}

/** One thing the gallery can show. A clip is never zoomed, only played. */
interface MediaItem {
  kind: "image" | "video";
  src: string;
}

/** How far the image grows under the pointer, and inside the lightbox. */
const HOVER_ZOOM = 2.2;
const LIGHTBOX_ZOOM = 2.5;

/**
 * Product media viewer: thumbnails, hover-to-zoom on desktop, and a fullscreen
 * lightbox with tap-to-zoom and panning on phones.
 *
 * Photos come first and the clip last, so the picture the shop chose as the main
 * one is still what greets the buyer — a video would open on a black frame,
 * since nothing autoplays here.
 */
export default function ProductGallery({ images, video, name }: Props) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [hoverZoom, setHoverZoom] = useState(false);
  // Percentages, so they drop straight into transform-origin.
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const media: MediaItem[] = [
    ...images.map((src): MediaItem => ({ kind: "image", src })),
    ...(video ? [{ kind: "video" as const, src: video }] : []),
  ];

  const current = media[index];
  const hasMany = media.length > 1;

  function resetZoom() {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
  }

  function openLightbox() {
    resetZoom();
    setLightbox(true);
  }

  function step(delta: number) {
    resetZoom();
    setIndex((prev) => (prev + delta + media.length) % media.length);
  }

  // Escape to close and arrows to move, but only while the lightbox is up —
  // otherwise the page's own arrow-key scrolling would stop working.
  useEffect(() => {
    if (!lightbox) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(false);
      if (event.key === "ArrowRight" && hasMany) step(1);
      if (event.key === "ArrowLeft" && hasMany) step(-1);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [lightbox, hasMany, media.length]);

  function handlePointerMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  // Placed after the hooks, not before them: an early return above would make
  // the effects run conditionally and break the rules of hooks.
  if (media.length === 0 || !current) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-border/60 bg-muted text-sm text-muted-foreground">
        Sin foto
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-start">
      <div className="min-w-0 flex-1">
        {current.kind === "video" ? (
          // No zoom wrapper: a clip is played, not inspected, and wrapping it in
          // the zoom handler would swallow taps meant for its own controls.
          <video
            src={current.src}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video de ${name}`}
            className="aspect-square w-full rounded-2xl border border-border/60 bg-black object-contain"
          />
        ) : (
          /* Hover zoom is pointer-driven, so it is bound to mouse events only;
             a touch tap opens the lightbox instead, where panning works. */
          <div
            role="button"
            tabIndex={0}
            aria-label={`Ampliar imagen de ${name}`}
            onClick={openLightbox}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openLightbox();
              }
            }}
            onMouseEnter={() => setHoverZoom(true)}
            onMouseLeave={() => setHoverZoom(false)}
            onMouseMove={handlePointerMove}
            className="group relative w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border/60 bg-muted"
          >
            <img
              src={current.src}
              alt={name}
              // contain, not cover: a shop photographs a product however it fits,
              // and cropping to a square cuts the ends off anything tall or wide.
              // The letterboxing lands on the wrapper's bg-muted.
              className="aspect-square w-full object-contain transition-transform duration-200"
              style={{
                transform: hoverZoom ? `scale(${HOVER_ZOOM})` : "scale(1)",
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">
              Toca para ampliar
            </span>
          </div>
        )}
      </div>

      {hasMany && (
        <ul className="flex gap-2 overflow-x-auto sm:w-16 sm:flex-col sm:overflow-visible">
          {media.map((item, position) => (
            <li key={item.src} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  resetZoom();
                  setIndex(position);
                }}
                aria-label={
                  item.kind === "video"
                    ? `Ver el video de ${name}`
                    : `Ver imagen ${position + 1} de ${media.length}`
                }
                aria-current={position === index}
                className={`relative size-16 overflow-hidden rounded-lg border-2 bg-muted transition-colors ${
                  position === index
                    ? "border-[var(--rystore-primary)]"
                    : "border-border/60 hover:border-border"
                }`}
              >
                {item.kind === "video" ? (
                  <>
                    {/* The clip itself is the thumbnail: preload="metadata"
                        paints its first frame, so the shop gets a real preview
                        without uploading a poster image. */}
                    <video
                      src={item.src}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full bg-black object-contain"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="size-6 text-white drop-shadow"
                        aria-hidden="true"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </>
                ) : (
                  <img src={item.src} alt="" className="size-full object-contain" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightbox && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen de ${name}`}
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">
              {hasMany ? `${index + 1} / ${media.length}` : name}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label="Cerrar imagen"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>

          <div
            className="flex flex-1 items-center justify-center overflow-hidden"
            onClick={(event) => {
              // A tap on the backdrop closes; a tap on the image zooms.
              if (event.target === event.currentTarget) setLightbox(false);
            }}
          >
            {current.kind === "video" ? (
              <video
                src={current.src}
                controls
                playsInline
                autoPlay
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <img
                src={current.src}
                alt={name}
                draggable={false}
                onClick={() => {
                  if (zoomed) resetZoom();
                  else setZoomed(true);
                }}
                onPointerDown={(event) => {
                  if (!zoomed) return;
                  dragStart.current = {
                    x: event.clientX - pan.x,
                    y: event.clientY - pan.y,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!zoomed || !dragStart.current) return;
                  setPan({
                    x: event.clientX - dragStart.current.x,
                    y: event.clientY - dragStart.current.y,
                  });
                }}
                onPointerUp={() => {
                  dragStart.current = null;
                }}
                className={`max-h-full max-w-full touch-none select-none object-contain transition-transform duration-200 ${
                  zoomed ? "cursor-grab" : "cursor-zoom-in"
                }`}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? LIGHTBOX_ZOOM : 1})`,
                }}
              />
            )}
          </div>

          {hasMany && (
            <div className="flex items-center justify-center gap-3 p-4">
              <button
                type="button"
                onClick={() => step(-1)}
                className="rounded-full bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/20"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="rounded-full bg-white/10 px-5 py-2 text-sm text-white hover:bg-white/20"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
