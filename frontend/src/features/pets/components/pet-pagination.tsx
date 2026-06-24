'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePetFilters } from '../hooks/use-pet-filters';
import type { PaginationMeta } from '@/types/api';
import { cn } from '@/lib/utils';

/**
 * Builds a page list with ellipses: 1 … 4 5 [6] 7 8 … 149.
 * Always shows first, last, and a window around the current page, so the control stays a fixed
 * width whether there are 3 pages or 300.
 */
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push('gap');
  for (let page = start; page <= end; page++) items.push(page);
  if (end < total - 1) items.push('gap');

  items.push(total);
  return items;
}

export function PetPagination({ meta }: { meta: PaginationMeta }) {
  const { setFilter } = usePetFilters();

  if (meta.totalPages <= 1) return null;

  function goTo(page: number) {
    setFilter('page', page);
    // The user is at the bottom of the list; without this they land mid-page on the next set.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasPrev}
        onClick={() => goTo(meta.page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <div className="flex items-center gap-1">
        {pageItems(meta.page, meta.totalPages).map((item, index) =>
          item === 'gap' ? (
            <span
              key={`gap-${index}`}
              className="text-muted-foreground px-1.5 text-sm"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === meta.page ? 'default' : 'ghost'}
              size="sm"
              onClick={() => goTo(item)}
              aria-label={`Page ${item}`}
              aria-current={item === meta.page ? 'page' : undefined}
              className={cn('size-9 tabular-nums', item === meta.page && 'bg-brand-gradient border-0 text-white')}
            >
              {item}
            </Button>
          ),
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasNext}
        onClick={() => goTo(meta.page + 1)}
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
