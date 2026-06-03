'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Renders a show/hide toggle and manages the input type. */
  revealable?: boolean;
}

/**
 * Label + input + error, wired for accessibility in one place.
 *
 * The shadcn registry in use here has no `form` component, and hand-rolling this per page would
 * mean re-deriving the aria wiring each time — which is exactly where it gets forgotten. The error
 * is announced via role="alert" and linked with aria-describedby so screen readers reach it.
 */
export function FormField({
  label,
  error,
  hint,
  revealable = false,
  className,
  type = 'text',
  ...props
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [revealed, setRevealed] = useState(false);

  const inputType = revealable ? (revealed ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={error ? 'text-destructive' : undefined}>
        {label}
      </Label>

      <div className="relative">
        <Input
          id={id}
          type={inputType}
          aria-invalid={Boolean(error)}
          aria-describedby={cn(error && errorId, hint && hintId) || undefined}
          className={cn(
            revealable && 'pr-10',
            error && 'border-destructive focus-visible:ring-destructive/30',
            className,
          )}
          {...props}
        />

        {revealable ? (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md transition-colors"
            // The button is a convenience, not content — keep it out of the tab order so
            // keyboard users move label to label without an interruption per password field.
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
