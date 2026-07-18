'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usersService } from '@/services/users.service';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

export function DeleteAccount({ user }: { user: User }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsPassword = user.provider === 'credentials';
  // Typing DELETE, not just clicking — this is irreversible and deserves a deliberate act.
  const canDelete = confirmText === 'DELETE' && (!needsPassword || password.length > 0);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await usersService.deleteAccount('DELETE', needsPassword ? password : undefined);
      setUser(null);
      toast.success('Your account has been deleted.');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(
        isApiError(err)
          ? (err.fields?.password ?? err.message)
          : 'Could not delete your account. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-2xl border p-5">
        <h3 className="font-semibold">Delete account</h3>
        <p className="text-muted-foreground mt-1 mb-4 text-sm leading-relaxed">
          Permanently closes your account and removes your personal details and favourites. Adoption
          records are kept in anonymised form, because shelters need a record of completed adoptions.
        </p>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
    );
  }

  return (
    <div className="border-destructive bg-destructive/5 flex flex-col gap-4 rounded-2xl border p-5">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-semibold">This cannot be undone</h3>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Your profile, favourites and open applications will be closed. You will be signed out
            everywhere immediately.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-delete">
          Type <span className="font-mono font-bold">DELETE</span> to confirm
        </Label>
        <Input
          id="confirm-delete"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          className="max-w-56"
        />
      </div>

      {needsPassword ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-password">Your password</Label>
          <Input
            id="delete-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="max-w-56"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="destructive" onClick={handleDelete} disabled={!canDelete || busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Deleting…
            </>
          ) : (
            'Permanently delete'
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setConfirmText('');
            setPassword('');
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
