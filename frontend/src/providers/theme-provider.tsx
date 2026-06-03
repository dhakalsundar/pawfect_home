'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * next-themes writes the theme class onto <html> from an inline script that runs before paint,
 * which is what prevents the white flash on a dark-mode reload. That requires
 * suppressHydrationWarning on <html> — see app/layout.tsx.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
