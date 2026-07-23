'use client';

import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * Theme is a device preference held by next-themes in localStorage, not part of the user record —
 * so it does not sync across devices, and does not need to.
 *
 * Reads `theme` (not `resolvedTheme`) so "System" shows as selected even while it resolves to dark.
 * No mounted-flag dance is needed because nothing here differs between server and client markup
 * except the ring, which settles on hydration without a visible flash.
 */
export function ThemePreference() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Colour theme" className="grid max-w-md gap-2 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors',
            theme === value
              ? 'border-primary bg-primary/5 ring-primary/20 ring-2'
              : 'hover:bg-muted/50',
          )}
        >
          <Icon className="text-muted-foreground size-5" />
          <span className="text-sm font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}
