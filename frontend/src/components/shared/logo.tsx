import Link from 'next/link';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/config/site';

interface LogoProps {
  className?: string;
  /** Hide the wordmark, keeping only the mark. Used in tight mobile headers. */
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn('group flex shrink-0 items-center gap-2.5', className)}
      aria-label={`${siteConfig.name} — home`}
    >
      <span className="bg-brand-gradient shadow-glow grid size-9 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105">
        {/* Paw mark, drawn rather than imported so it inherits currentColor and needs no request. */}
        <svg
          viewBox="0 0 24 24"
          className="size-5 text-white"
          fill="currentColor"
          aria-hidden="true"
        >
          <ellipse cx="7.5" cy="8" rx="2.1" ry="2.7" />
          <ellipse cx="12" cy="6.4" rx="2.1" ry="2.9" />
          <ellipse cx="16.5" cy="8" rx="2.1" ry="2.7" />
          <ellipse cx="19.4" cy="12.4" rx="1.9" ry="2.3" />
          <path d="M12 11.6c2.8 0 5.4 2.1 5.4 4.6 0 2-1.6 3.2-3.6 3.2-1 0-1.4-.3-1.8-.3s-.8.3-1.8.3c-2 0-3.6-1.2-3.6-3.2 0-2.5 2.6-4.6 5.4-4.6Z" />
        </svg>
      </span>
      {!iconOnly ? (
        <span className="text-lg font-bold tracking-tight">
          Pawfect<span className="text-brand-gradient">Home</span>
        </span>
      ) : null}
    </Link>
  );
}
