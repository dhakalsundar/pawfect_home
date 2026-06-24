'use client';

import { useEffect, useId, useState } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { usePetFilters } from '../hooks/use-pet-filters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SIZE_LABELS, SPECIES_LABELS, type PetFacets } from '@/types/pet';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckRow({
  id,
  label,
  count,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-center justify-between text-sm">
        <span>{label}</span>
        {count !== undefined ? (
          /*
           * `aria-hidden` on the count, with the whole thing described by the label text instead.
           * Without this the accessible name concatenates to "Dog202" — there is no whitespace
           * between adjacent inline elements for a screen reader to infer a gap from, however far
           * apart flexbox pushes them visually.
           */
          <span aria-hidden="true" className="text-muted-foreground text-xs tabular-nums">
            {count}
          </span>
        ) : null}
      </label>
    </div>
  );
}

/** Age brackets in months, matching what the API expects. */
const AGE_RANGES = [
  { label: 'Baby (under 6 months)', min: 0, max: 6 },
  { label: 'Young (6 months – 2 years)', min: 6, max: 24 },
  { label: 'Adult (2 – 8 years)', min: 24, max: 96 },
  { label: 'Senior (8+ years)', min: 96, max: 600 },
];

export function PetFiltersPanel({ facets }: { facets: PetFacets }) {
  /**
   * This panel is rendered TWICE on the pets page — once in the desktop sidebar, once inside the
   * mobile filter drawer. Hard-coded ids meant both copies shared `id="pet-search"`,
   * `id="species-dog"` and so on the moment the drawer opened: invalid HTML, and every
   * `<label for>` then pointed at an ambiguous target. Found by Playwright in Batch 15, which is
   * the first tool in this project able to open the drawer.
   *
   * `useId` gives each instance its own namespace.
   */
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const { filters, setFilter, setFilters, toggleInList, isInList, clearAll, activeCount } =
    usePetFilters();

  // The input is locally controlled so typing feels instant; the debounced value drives the URL.
  const [searchInput, setSearchInput] = useState(filters.q ?? '');
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  /**
   * Re-sync the box when the URL changes from somewhere else — "Clear all", the back button, or a
   * link with a preset query.
   *
   * Adjusted during render rather than in an effect. An effect would render once with the stale
   * value, then immediately re-render with the corrected one; comparing against the previous prop
   * here lets React discard the in-progress render and redo it before anything is committed.
   * https://react.dev/reference/react/useState#storing-information-from-previous-renders
   */
  const [lastUrlQuery, setLastUrlQuery] = useState(filters.q);
  if (filters.q !== lastUrlQuery) {
    setLastUrlQuery(filters.q);
    setSearchInput(filters.q ?? '');
  }

  useEffect(() => {
    const current = filters.q ?? '';
    if (debouncedSearch !== current) {
      setFilter('q', debouncedSearch || undefined);
    }
    // Intentionally keyed only on the debounced value: adding `filters.q` would re-fire this the
    // moment the URL updates and fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const ageActive = (range: (typeof AGE_RANGES)[number]) =>
    filters.minAge === String(range.min) && filters.maxAge === String(range.max);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          Filters
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-2">
              {activeCount}
            </Badge>
          ) : null}
        </h2>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 gap-1.5 text-xs">
            <RotateCcw className="size-3" />
            Clear all
          </Button>
        ) : null}
      </div>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <label htmlFor={fieldId('pet-search')} className="sr-only">
          Search pets by name or breed
        </label>
        <Input
          id={fieldId('pet-search')}
          type="search"
          placeholder="Name or breed…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="pl-9"
        />
        {searchInput ? (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Separator />

      <Group title="Species">
        {facets.species.map((bucket) => (
          <CheckRow
            key={bucket.value}
            id={fieldId(`species-${bucket.value}`)}
            label={SPECIES_LABELS[bucket.value as keyof typeof SPECIES_LABELS] ?? bucket.value}
            count={bucket.count}
            checked={isInList('species', bucket.value)}
            onChange={() => toggleInList('species', bucket.value)}
          />
        ))}
      </Group>

      <Separator />

      <Group title="Age">
        {AGE_RANGES.map((range) => (
          <CheckRow
            key={range.label}
            id={fieldId(`age-${range.min}`)}
            label={range.label}
            checked={ageActive(range)}
            onChange={() =>
              // Ranges are mutually exclusive, so selecting one replaces rather than adds.
              ageActive(range)
                ? setFilters({ minAge: undefined, maxAge: undefined })
                : setFilters({ minAge: range.min, maxAge: range.max })
            }
          />
        ))}
      </Group>

      <Separator />

      <Group title="Size">
        {facets.size.map((bucket) => (
          <CheckRow
            key={bucket.value}
            id={fieldId(`size-${bucket.value}`)}
            label={SIZE_LABELS[bucket.value as keyof typeof SIZE_LABELS] ?? bucket.value}
            count={bucket.count}
            checked={isInList('size', bucket.value)}
            onChange={() => toggleInList('size', bucket.value)}
          />
        ))}
      </Group>

      <Separator />

      <Group title="Gender">
        {facets.gender
          .filter((bucket) => bucket.value !== 'unknown')
          .map((bucket) => (
            <CheckRow
              key={bucket.value}
              id={fieldId(`gender-${bucket.value}`)}
              label={bucket.value === 'male' ? 'Male' : 'Female'}
              count={bucket.count}
              checked={isInList('gender', bucket.value)}
              onChange={() => toggleInList('gender', bucket.value)}
            />
          ))}
      </Group>

      <Separator />

      <Group title="Good with">
        <CheckRow
          id={fieldId('good-kids')}
          label="Children"
          count={facets.goodWith.kids}
          checked={filters.goodWithKids}
          onChange={() => setFilter('goodWithKids', !filters.goodWithKids)}
        />
        <CheckRow
          id={fieldId('good-dogs')}
          label="Dogs"
          count={facets.goodWith.dogs}
          checked={filters.goodWithDogs}
          onChange={() => setFilter('goodWithDogs', !filters.goodWithDogs)}
        />
        <CheckRow
          id={fieldId('good-cats')}
          label="Cats"
          count={facets.goodWith.cats}
          checked={filters.goodWithCats}
          onChange={() => setFilter('goodWithCats', !filters.goodWithCats)}
        />
      </Group>

      <Separator />

      <Group title="Health">
        <CheckRow
          id={fieldId('health-vaccinated')}
          label="Vaccinated"
          count={facets.health.vaccinated}
          checked={filters.vaccinated}
          onChange={() => setFilter('vaccinated', !filters.vaccinated)}
        />
        <CheckRow
          id={fieldId('health-neutered')}
          label="Neutered / spayed"
          count={facets.health.neutered}
          checked={filters.neutered}
          onChange={() => setFilter('neutered', !filters.neutered)}
        />
        <CheckRow
          id={fieldId('health-special')}
          label="Special needs"
          count={facets.health.specialNeeds}
          checked={filters.specialNeeds}
          onChange={() => setFilter('specialNeeds', !filters.specialNeeds)}
        />
      </Group>

      {facets.city.length > 0 ? (
        <>
          <Separator />
          <Group title="Location">
            {facets.city.slice(0, 8).map((bucket) => (
              <CheckRow
                key={bucket.value}
                id={fieldId(`city-${bucket.value}`)}
                label={bucket.value}
                count={bucket.count}
                checked={filters.city === bucket.value}
                onChange={() =>
                  setFilter('city', filters.city === bucket.value ? undefined : bucket.value)
                }
              />
            ))}
          </Group>
        </>
      ) : null}
    </div>
  );
}
