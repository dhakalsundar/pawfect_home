'use client';

import { PawPrint, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PetCard } from './pet-card';
import { PetPagination } from './pet-pagination';
import { usePetFilters } from '../hooks/use-pet-filters';
import type { PaginationMeta } from '@/types/api';
import type { Pet } from '@/types/pet';
import { cn } from '@/lib/utils';

/**
 * Client wrapper around server-rendered cards.
 *
 * It is a client component only to read `view` from the URL and to dim the grid during a pending
 * navigation. The cards themselves are passed in as `children`-style props from the server, so
 * they stay Server Components — see the composition note in docs/01-ARCHITECTURE.md §5.
 */
export function PetResults({
  pets,
  meta,
  favoritedIds = [],
}: {
  pets: Pet[];
  meta: PaginationMeta;
  /** Resolved server-side so hearts render filled on first paint. */
  favoritedIds?: string[];
}) {
  const { filters, clearAll, activeCount, isPending } = usePetFilters();
  const layout = filters.view === 'list' ? 'list' : 'grid';
  const favorited = new Set(favoritedIds);

  if (pets.length === 0) {
    return (
      <EmptyState
        icon={PawPrint}
        title="No pets match those filters"
        description={
          activeCount > 0
            ? 'Try widening your search — removing a filter or two usually helps.'
            : 'There are no pets listed right now. Please check back soon.'
        }
        action={
          activeCount > 0 ? (
            <Button onClick={clearAll} variant="outline" className="gap-2">
              <RotateCcw className="size-4" />
              Clear all filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        className={cn(
          'transition-opacity duration-200',
          // Dimmed rather than replaced by a skeleton: the user keeps their context while the
          // next page loads, and the layout does not collapse and re-expand.
          isPending && 'pointer-events-none opacity-50',
        )}
        aria-busy={isPending}
      >
        {layout === 'list' ? (
          <div className="flex flex-col gap-4">
            {pets.map((pet, index) => (
              <PetCard
                key={pet.id}
                pet={pet}
                layout="list"
                priority={index < 4}
                favorited={favorited.has(pet.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pets.map((pet, index) => (
              <PetCard
                key={pet.id}
                pet={pet}
                priority={index < 4}
                favorited={favorited.has(pet.id)}
              />
            ))}
          </div>
        )}
      </div>

      <PetPagination meta={meta} />
    </div>
  );
}
