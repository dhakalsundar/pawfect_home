'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Link2, Loader2, Star, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  uploadService,
  uploadToCloudinary,
  validateFile,
  ACCEPTED_TYPES,
  MAX_FILE_SIZE_MB,
  type UploadFolder,
} from '@/services/upload.service';
import { isApiError } from '@/services/api-error';
import { cn } from '@/lib/utils';

export interface ManagedImage {
  url: string;
  publicId?: string;
  isPrimary: boolean;
}

interface Pending {
  id: string;
  name: string;
  progress: number;
}

/**
 * Drag-and-drop uploader with a URL fallback.
 *
 * When Cloudinary is not configured the component degrades to pasting image URLs rather than
 * disappearing — the shelter dashboard has to stay usable before credentials are wired up.
 */
export function ImageUploader({
  images,
  onChange,
  folder = 'pets',
  max = 8,
}: {
  images: ManagedImage[];
  onChange: (images: ManagedImage[]) => void;
  folder?: UploadFolder;
  max?: number;
}) {
  const [uploadEnabled, setUploadEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    uploadService
      .config()
      .then((config) => setUploadEnabled(config.enabled))
      .catch(() => setUploadEnabled(false));
  }, []);

  /** Ensures exactly one primary, promoting the first image if the previous one is gone. */
  const normalise = useCallback((next: ManagedImage[]): ManagedImage[] => {
    if (next.length === 0) return next;
    if (next.some((image) => image.isPrimary)) return next;
    return next.map((image, index) => ({ ...image, isPrimary: index === 0 }));
  }, []);

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);

    if (images.length + list.length > max) {
      setError(`At most ${max} photos.`);
      return;
    }

    // Validate everything before uploading anything, so one bad file does not leave a
    // half-finished batch behind.
    for (const file of list) {
      const problem = validateFile(file);
      if (problem) {
        setError(problem);
        return;
      }
    }

    for (const file of list) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending((current) => [...current, { id, name: file.name, progress: 0 }]);

      try {
        const signature = await uploadService.signature(folder);
        const uploaded = await uploadToCloudinary(file, signature, (percent) => {
          setPending((current) =>
            current.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
          );
        });

        onChange(
          normalise([
            ...images,
            { url: uploaded.url, publicId: uploaded.publicId, isPrimary: images.length === 0 },
          ]),
        );
      } catch (uploadError) {
        setError(
          isApiError(uploadError)
            ? uploadError.message
            : uploadError instanceof Error
              ? uploadError.message
              : 'Upload failed.',
        );
      } finally {
        setPending((current) => current.filter((item) => item.id !== id));
      }
    }
  }

  async function removeImage(index: number) {
    const target = images[index]!;
    const next = normalise(images.filter((_, i) => i !== index));
    onChange(next);

    // Best-effort cleanup so an abandoned upload does not linger in storage. The pet's own
    // save path also reconciles this, so a failure here is not worth surfacing.
    if (target.publicId) {
      try {
        await uploadService.deleteAsset(target.publicId);
      } catch {
        // Ignored deliberately — see above.
      }
    }
  }

  function addUrl() {
    setError(null);
    const url = urlInput.trim();
    if (!url) return;

    try {
      new URL(url);
    } catch {
      setError('That does not look like a valid URL.');
      return;
    }
    if (images.length >= max) {
      setError(`At most ${max} photos.`);
      return;
    }
    if (images.some((image) => image.url === url)) {
      setError('That photo is already added.');
      return;
    }

    onChange(normalise([...images, { url, isPrimary: images.length === 0 }]));
    setUrlInput('');
  }

  const busy = pending.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {uploadEnabled === false ? (
        <Alert>
          <Link2 className="size-4" />
          <AlertDescription>
            Image uploads are not configured on this server, so paste image URLs instead. Add your
            Cloudinary credentials to <code className="text-xs">backend/.env</code> to enable
            uploading.
          </AlertDescription>
        </Alert>
      ) : null}

      {uploadEnabled ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            'rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
          )}
        >
          <span className="bg-brand-50 text-primary-strong mx-auto mb-3 grid size-12 place-items-center rounded-2xl">
            <ImagePlus className="size-6" />
          </span>
          <p className="font-medium">Drag photos here</p>
          <p className="text-muted-foreground mt-1 text-sm">
            JPEG, PNG, WebP or AVIF · up to {MAX_FILE_SIZE_MB} MB each · {max} photos maximum
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy || images.length >= max}
            className="mt-4 gap-1.5"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Choose files
          </Button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            aria-label="Choose photos to upload"
            onChange={(event) => {
              if (event.target.files) void handleFiles(event.target.files);
              // Reset so selecting the same file twice still fires a change event.
              event.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://images.unsplash.com/photo-…"
            aria-label="Image URL"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addUrl();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addUrl} className="shrink-0">
            Add
          </Button>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {pending.map((item) => (
            <li key={item.id} className="bg-muted/40 rounded-xl p-3">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="truncate">{item.name}</span>
                <span className="text-muted-foreground tabular-nums">{item.progress}%</span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-brand-gradient h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.url} className="group relative">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-xl border">
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="160px"
                  className="object-cover"
                  // A pasted URL may be from an unconfigured host; unoptimized keeps the editor
                  // working rather than hard-failing the page.
                  unoptimized
                />
              </div>

              {image.isPrimary ? (
                <Badge className="bg-brand-gradient absolute top-2 left-2 gap-1 border-0 text-white">
                  <Star className="size-3 fill-current" />
                  Main
                </Badge>
              ) : null}

              <div className="absolute right-2 bottom-2 flex gap-1">
                {!image.isPrimary ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(images.map((item, i) => ({ ...item, isPrimary: i === index })))
                    }
                    className="glass grid size-7 place-items-center rounded-lg border"
                    aria-label={`Make photo ${index + 1} the main photo`}
                  >
                    <Star className="size-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeImage(index)}
                  className="glass hover:text-destructive grid size-7 place-items-center rounded-lg border"
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
