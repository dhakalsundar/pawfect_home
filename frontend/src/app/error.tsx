'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/shared/section';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Wire this to an error-reporting service (Sentry etc.) when one is provisioned; until then
    // the console is the only sink. `error.digest` correlates it with the server-side log.
    console.error('Route error:', error);
  }, [error]);

  return (
    <Section size="lg">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="bg-destructive/10 text-destructive grid size-16 place-items-center rounded-2xl">
          <TriangleAlert className="size-8" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">Something went wrong</h1>
          <p className="text-muted-foreground mx-auto max-w-md text-pretty">
            An unexpected error occurred while loading this page. Trying again often fixes it.
          </p>
          {error.digest ? (
            <p className="text-muted-foreground text-xs">
              Reference: <code className="bg-muted rounded px-1.5 py-0.5">{error.digest}</code>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset} className="bg-brand-gradient border-0 text-white">
            <RotateCcw />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home />
              Back home
            </Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
