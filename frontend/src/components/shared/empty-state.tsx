import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** A button or link — always give an empty state a way forward. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-2xl">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
