'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, CheckCircle2, Ellipsis, Loader2, ShieldCheck, UserCog } from 'lucide-react';
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
import { adminService } from '@/services/admin.service';
import { isApiError } from '@/services/api-error';
import type { UserRole, UserStatus } from '@/types/auth';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'Adopter' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'admin', label: 'Admin' },
];

export function UserActions({
  userId,
  name,
  role,
  status,
  isSelf,
}: {
  userId: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /** An admin cannot demote or ban themselves — the API enforces it; this hides the footgun. */
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function changeRole(next: UserRole) {
    setBusy(true);
    try {
      await adminService.setUserRole(userId, next);
      toast.success(`${name} is now a ${next}. Their existing sessions were ended.`);
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not change the role.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: UserStatus) {
    setBusy(true);
    try {
      await adminService.setUserStatus(userId, next);
      toast.success(
        next === 'active'
          ? `${name} has been reactivated.`
          : `${name} has been ${next} and signed out everywhere.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : 'Could not change the status.');
    } finally {
      setBusy(false);
    }
  }

  if (isSelf) {
    return (
      <span className="text-muted-foreground text-xs whitespace-nowrap">You</span>
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
          aria-label={`Actions for ${name}`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Change role
        </DropdownMenuLabel>
        {ROLES.filter((option) => option.value !== role).map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => changeRole(option.value)}>
            {option.value === 'admin' ? (
              <ShieldCheck className="size-4" />
            ) : (
              <UserCog className="size-4" />
            )}
            Make {option.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Account status
        </DropdownMenuLabel>

        {status !== 'active' ? (
          <DropdownMenuItem onClick={() => changeStatus('active')}>
            <CheckCircle2 className="size-4" />
            Reactivate
          </DropdownMenuItem>
        ) : null}
        {status !== 'suspended' ? (
          <DropdownMenuItem onClick={() => changeStatus('suspended')}>
            <Ban className="size-4" />
            Suspend
          </DropdownMenuItem>
        ) : null}
        {status !== 'banned' ? (
          <DropdownMenuItem variant="destructive" onClick={() => changeStatus('banned')}>
            <Ban className="size-4" />
            Ban
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
