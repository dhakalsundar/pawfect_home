'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GalleryImage {
  url: string;
  isPrimary: boolean;
}

/**
 * Image gallery with a keyboard-navigable lightbox and pointer zoom.
 *
 * Client-side because it owns selection, focus management and pointer tracking. Kept to just the
 * gallery so the rest of the detail page stays server-rendered.
 */
export function PetGallery({ images, petName }: { images: GalleryImage[]; petName: string }) {
  const [index, setIndex] = useState(() => {
    const primary = images.findIndex((image) => image.isPrimary);
    return primary >= 0 ? primary : 0;
  });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const count = images.length;
  const go = useCallback(
    (delta: number) => {
      // Wraps in both directions, so "previous" from the first image lands on the last.
      setIndex((current) => (current + delta + count) % count);
      setZoomed(false);
    },
    [count],
  );

  const openLightbox = () => setLightboxOpen(true);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setZoomed(false);
    // Return focus to the control that opened the dialog, or the keyboard user is dumped at the
    // top of the document with no idea where they were.
    triggerRef.current?.focus();
  }, []);

  // Keyboard control while the lightbox is open.
  useEffect(() => {
    if (!lightboxOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }

    document.addEventListener('keydown', onKeyDown);
    // The page behind a modal must not scroll with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen, go, closeLightbox]);

  /** Zoom toward the cursor rather than the centre, so you magnify what you pointed at. */
  function handleZoomMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!zoomed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  const current = images[index]!;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="group bg-muted relative aspect-[4/3] overflow-hidden rounded-2xl">
          <Image
            src={current.url}
            alt={`${petName} — photo ${index + 1} of ${count}`}
            fill
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover"
            priority
          />

          <button
            ref={triggerRef}
            type="button"
            onClick={openLightbox}
            className="glass absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-opacity"
            aria-label={`View ${petName}'s photos full screen`}
          >
            <Expand className="size-3.5" />
            View
          </button>

          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="glass absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="glass absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Next photo"
              >
                <ChevronRight className="size-4" />
              </button>

              <span className="glass absolute top-3 left-3 rounded-full border px-2.5 py-1 text-xs tabular-nums">
                {index + 1} / {count}
              </span>
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {images.map((image, thumbIndex) => (
              <li key={image.url}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(thumbIndex);
                    setZoomed(false);
                  }}
                  aria-label={`Show photo ${thumbIndex + 1}`}
                  aria-current={thumbIndex === index}
                  className={cn(
                    'relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition-all',
                    thumbIndex === index
                      ? 'border-primary'
                      : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 25vw, 120px"
                    className="object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {lightboxOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${petName} photo gallery`}
          className="fixed inset-0 z-[100] flex flex-col bg-black/92 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm tabular-nums">
              {index + 1} / {count}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoomed((value) => !value)}
                className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
                aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
                aria-pressed={zoomed}
              >
                {zoomed ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeLightbox}
                className="grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10"
                aria-label="Close gallery"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
            <div
              className={cn(
                'relative h-full w-full max-w-5xl overflow-hidden',
                zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
              )}
              onMouseMove={handleZoomMove}
              onClick={() => setZoomed((value) => !value)}
            >
              <Image
                src={current.url}
                alt={`${petName} — photo ${index + 1} of ${count}`}
                fill
                sizes="100vw"
                className={cn(
                  'object-contain transition-transform duration-300',
                  zoomed && 'scale-[2.2]',
                )}
                style={zoomed ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
              />
            </div>

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-4 grid size-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-4 grid size-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>

          <p className="pb-4 text-center text-xs text-white/50">
            Arrow keys to navigate · Esc to close
          </p>
        </div>
      ) : null}
    </>
  );
}
