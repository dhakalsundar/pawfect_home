'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Info, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  uploadService,
  uploadToCloudinary,
  validateFile,
  ACCEPTED_TYPES,
  MAX_FILE_SIZE_MB,
} from '@/services/upload.service';
import { usersService } from '@/services/users.service';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AvatarUpload({ user }: { user: User }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [uploadEnabled, setUploadEnabled] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    uploadService
      .config()
      .then((config) => setUploadEnabled(config.enabled))
      .catch(() => setUploadEnabled(false));
  }, []);

  async function handleFile(file: File) {
    setError(null);

    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setProgress(0);
    try {
      const signature = await uploadService.signature('avatars');
      const uploaded = await uploadToCloudinary(file, signature, setProgress);

      // Persist immediately rather than waiting for the profile form's Save — a photo that
      // appears to have uploaded but silently reverts on navigation is worse than no upload.
      const updated = await usersService.updateProfile({
        avatar: { url: uploaded.url, publicId: uploaded.publicId },
      });

      setUser(updated);
      toast.success('Photo updated.');
      router.refresh();
    } catch (uploadError) {
      setError(
        isApiError(uploadError)
          ? uploadError.message
          : uploadError instanceof Error
            ? uploadError.message
            : 'Could not upload that photo.',
      );
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="size-16">
          {user.avatar?.url ? <AvatarImage src={user.avatar.url} alt="" /> : null}
          <AvatarFallback className="bg-brand-gradient text-lg font-semibold text-white">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>

        {busy ? (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-xs font-semibold text-white tabular-nums">
            {progress}%
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {uploadEnabled ? (
          <>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                {user.avatar?.url ? 'Change photo' : 'Upload photo'}
              </Button>

              {user.avatar?.url ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                  onClick={async () => {
                    try {
                      const updated = await usersService.updateProfile({
                        // Empty strings are treated as "unset" by the API's clean() helper.
                        avatar: { url: '', publicId: '' },
                      });
                      setUser(updated);
                      toast.success('Photo removed.');
                      router.refresh();
                    } catch {
                      toast.error('Could not remove the photo.');
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              ) : null}
            </div>

            <p className="text-muted-foreground text-xs">
              JPEG, PNG, WebP or AVIF · up to {MAX_FILE_SIZE_MB} MB
            </p>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="sr-only"
              aria-label="Choose a profile photo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
          </>
        ) : (
          <div className="text-muted-foreground flex items-start gap-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Photo uploads are not configured on this server.
              {user.provider === 'google' ? ' Your Google picture is shown instead.' : ''}
            </p>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
