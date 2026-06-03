import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';
import { Container } from './container';

const spacing = {
  sm: 'py-12 sm:py-16',
  md: 'py-16 sm:py-20 lg:py-24',
  lg: 'py-20 sm:py-28 lg:py-32',
} as const;

interface SectionProps extends ComponentProps<'section'> {
  size?: keyof typeof spacing;
  /** Warm radial wash behind the content. Use sparingly — roughly every third section. */
  glow?: boolean;
  containerWidth?: ComponentProps<typeof Container>['width'];
  /** Set false to manage the inner container yourself (full-bleed carousels). */
  contained?: boolean;
}

export function Section({
  className,
  size = 'md',
  glow = false,
  contained = true,
  containerWidth,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn('relative', spacing[size], glow && 'bg-brand-glow', className)}
      {...props}
    >
      {contained ? <Container width={containerWidth}>{children}</Container> : children}
    </section>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

/** Consistent eyebrow / title / description block so every section header matches. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl',
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-primary-strong text-sm font-semibold tracking-wide uppercase">{eyebrow}</span>
      ) : null}
      <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
      {description ? (
        <p className="text-muted-foreground text-base leading-relaxed text-pretty sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
