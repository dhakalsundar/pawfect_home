'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ellipsis, ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shelterService } from '@/services/shelter.service';
import { isApiError } from '@/services/api-error';
import type { Pet, PetStatus } from '@/types/pet';

const STATUS_ACTIONS: { value: PetStatus; label: string }[] = [
  { value: 'available', label: 'Mark available' },
  { value: 'reserved', label: 'Mark reserved' },
  { value: 'adopted', label: 'Mark adopted' },
  { value: 'archived', label: 'Archive' },
];

export function PetRowActions({ pet }: { pet: Pet }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function setStatus(status: PetStatus) {
    setBusy(true);
    try {
      await shelterService.setStatus(pet.id, status as 'available' | 'reserved' | 'adopted' | 'archived');
      toast.success(
        status === 'adopted'
          ? `${pet.name} marked adopted. Open applications were closed and applicants notified.`
          : `${pet.name} is now ${status}.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not update. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await shelterService.deletePet(pet.id);
      toast.success(`${pet.name} removed.`);
      setConfirmingDelete(false);
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not delete. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Remove {pet.name}?</span>
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : 'Yes'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>
          No
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy}
          aria-label={`Actions for ${pet.name}`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/shelter/pets/${pet.slug}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/pets/${pet.slug}`} target="_blank">
            <ExternalLink className="size-4" />
            View public page
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Change status
        </DropdownMenuLabel>

        {STATUS_ACTIONS.filter((action) => action.value !== pet.status).map((action) => (
          <DropdownMenuItem key={action.value} onClick={() => setStatus(action.value)}>
            {action.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
          <Trash2 className="size-4" />
          Remove listing
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
