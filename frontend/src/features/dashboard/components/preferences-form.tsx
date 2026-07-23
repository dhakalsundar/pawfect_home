'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { usersService } from '@/services/users.service';
import { useAuth } from '@/providers/auth-provider';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

const TOGGLES = [
  {
    key: 'emailNotifications' as const,
    label: 'Email notifications',
    description: 'Application updates, messages from shelters, and adoption news.',
  },
  {
    key: 'pushNotifications' as const,
    label: 'In-app notifications',
    description: 'Alerts inside PawfectHome while you are signed in.',
  },
  {
    key: 'newsletter' as const,
    label: 'Monthly newsletter',
    description: 'New arrivals near you and stories from families who adopted.',
  },
];

export function PreferencesForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [preferences, setPreferences] = useState(user.preferences);
  const [pending, setPending] = useState<string | null>(null);

  /**
   * Saves on toggle rather than behind a Save button — a settings switch that needs confirming
   * feels broken. Optimistic, with rollback if the request fails.
   */
  async function toggle(key: (typeof TOGGLES)[number]['key']) {
    const previous = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setPending(key);

    try {
      const updated = await usersService.updatePreferences({ [key]: next[key] });
      setUser(updated);
    } catch (error) {
      setPreferences(previous);
      toast.error(isApiError(error) ? error.message : 'Could not save. Please try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <ul className="flex flex-col gap-4">
      {TOGGLES.map(({ key, label, description }) => (
        <li key={key} className="flex items-start gap-3">
          <Checkbox
            id={`pref-${key}`}
            checked={preferences[key]}
            onCheckedChange={() => toggle(key)}
            disabled={pending === key}
            className="mt-0.5"
          />
          <label htmlFor={`pref-${key}`} className="flex-1 cursor-pointer">
            <span className="block text-sm font-medium">{label}</span>
            <span className="text-muted-foreground block text-sm">{description}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
