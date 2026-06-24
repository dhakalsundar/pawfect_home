'use client';

import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PetFiltersPanel } from './pet-filters';
import { usePetFilters } from '../hooks/use-pet-filters';
import { SORT_OPTIONS, type PetFacets } from '@/types/pet';
import { cn } from '@/lib/utils';

export function PetToolbar({ total, facets }: { total: number; facets: PetFacets }) {
  const { filters, setFilter, activeCount } = usePetFilters();
  const currentSort = SORT_OPTIONS.find((option) => option.value === filters.sort) ?? SORT_OPTIONS[0]!;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        <span className="text-foreground font-semibold tabular-nums">{total.toLocaleString()}</span>{' '}
        {total === 1 ? 'pet' : 'pets'} found
      </p>

      <div className="flex items-center gap-2">
        {/* Filters live in a sheet on mobile; the sidebar handles desktop. */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 lg:hidden">
              <SlidersHorizontal className="size-4" />
              Filters
              {activeCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5 px-1.5">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-sm">
            <SheetHeader className="border-b px-5 py-4 text-left">
              <SheetTitle>Filter pets</SheetTitle>
              <SheetDescription className="sr-only">
                Narrow the results by species, age, size and more
              </SheetDescription>
            </SheetHeader>
            <div className="p-5">
              <PetFiltersPanel facets={facets} />
            </div>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Sort: {currentSort.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setFilter('sort', option.value)}
                className={filters.sort === option.value ? 'bg-accent text-accent-foreground' : ''}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* radiogroup rather than two buttons: it is one choice with two options. */}
        <div className="hidden items-center rounded-lg border p-0.5 sm:flex" role="radiogroup" aria-label="View layout">
          {(
            [
              { value: 'grid', icon: LayoutGrid, label: 'Grid view' },
              { value: 'list', icon: List, label: 'List view' },
            ] as const
          ).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filters.view === value}
              aria-label={label}
              onClick={() => setFilter('view', value)}
              className={cn(
                'grid size-8 place-items-center rounded-md transition-colors',
                filters.view === value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
