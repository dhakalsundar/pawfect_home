'use client';

import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const options = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  /**
   * Both icons are always rendered and swapped by the `dark` class, rather than picking one from
   * `resolvedTheme`. The usual mounted-flag dance exists because the server cannot know the user's
   * theme — but CSS can, since next-themes stamps `.dark` onto <html> before paint. This avoids the
   * hydration mismatch with no effect, no extra render, and no disabled placeholder flashing on load.
   *
   * `theme` (not `resolvedTheme`) still drives the checkmark, because "System" must show as
   * selected even when it currently resolves to dark.
   */
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Toggle theme">
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {options.map(({ value, label, icon: OptionIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? 'bg-accent text-accent-foreground' : ''}
          >
            <OptionIcon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
