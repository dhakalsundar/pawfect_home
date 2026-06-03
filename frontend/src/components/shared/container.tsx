import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

const widths = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-none',
} as const;

interface ContainerProps extends ComponentProps<'div'> {
  width?: keyof typeof widths;
}

/** The one place horizontal page gutters are defined. Every section uses it. */
export function Container({ className, width = 'xl', ...props }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', widths[width], className)} {...props} />
  );
}
