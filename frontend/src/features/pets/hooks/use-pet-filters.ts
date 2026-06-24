'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type FilterValue = string | number | boolean | undefined;

/**
 * Filter state lives in the URL, not in React state.
 *
 * That is the whole design: a filtered listing is shareable, survives refresh and the back button,
 * and the Server Component can read it from searchParams and render the correct results on the
 * first paint. Mirroring it into useState would immediately create two sources of truth.
 */
export function usePetFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Keeps the current results visible (dimmed) while the server fetches the next set, instead of
  // blanking the page on every checkbox click.
  const [isPending, startTransition] = useTransition();

  const filters = useMemo(() => {
    const get = (key: string) => searchParams.get(key) ?? undefined;
    return {
      q: get('q'),
      species: get('species'),
      gender: get('gender'),
      size: get('size'),
      activityLevel: get('activityLevel'),
      breed: get('breed'),
      city: get('city'),
      minAge: get('minAge'),
      maxAge: get('maxAge'),
      minFee: get('minFee'),
      maxFee: get('maxFee'),
      goodWithKids: get('goodWithKids') === 'true',
      goodWithDogs: get('goodWithDogs') === 'true',
      goodWithCats: get('goodWithCats') === 'true',
      vaccinated: get('vaccinated') === 'true',
      neutered: get('neutered') === 'true',
      specialNeeds: get('specialNeeds') === 'true',
      sort: get('sort') ?? 'newest',
      view: get('view') ?? 'grid',
      page: Number(get('page') ?? 1),
    };
  }, [searchParams]);

  const push = useCallback(
    (params: URLSearchParams) => {
      const queryString = params.toString();
      startTransition(() => {
        // scroll: false — nudging a checkbox should not throw the user back to the top of the page.
        router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  /** Sets or clears one param. Any filter change resets to page 1. */
  const setFilter = useCallback(
    (key: string, value: FilterValue) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value === undefined || value === '' || value === false) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }

      // Staying on page 7 after narrowing to 12 results would show an empty page.
      if (key !== 'page' && key !== 'view') params.delete('page');

      push(params);
    },
    [searchParams, push],
  );

  /** Applies several changes in one navigation, rather than one push per key. */
  const setFilters = useCallback(
    (updates: Record<string, FilterValue>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '' || value === false) params.delete(key);
        else params.set(key, String(value));
      }
      params.delete('page');
      push(params);
    },
    [searchParams, push],
  );

  /** Toggles one value inside a comma-separated multi-select param. */
  const toggleInList = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = (params.get(key) ?? '').split(',').filter(Boolean);
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];

      if (next.length > 0) params.set(key, next.join(','));
      else params.delete(key);

      params.delete('page');
      push(params);
    },
    [searchParams, push],
  );

  const isInList = useCallback(
    (key: string, value: string) => (searchParams.get(key) ?? '').split(',').includes(value),
    [searchParams],
  );

  const clearAll = useCallback(() => {
    // `view` is a display preference, not a filter — clearing filters should not flip the layout
    // back to grid on someone who chose list.
    const params = new URLSearchParams();
    const view = searchParams.get('view');
    if (view) params.set('view', view);
    push(params);
  }, [searchParams, push]);

  /** Drives the "N filters applied" badge and whether the clear button is shown. */
  const activeCount = useMemo(() => {
    let count = 0;
    for (const [key, value] of searchParams.entries()) {
      if (['page', 'sort', 'view'].includes(key)) continue;
      if (!value) continue;
      // A multi-select counts once per selected value.
      count += key === 'q' ? 1 : value.split(',').filter(Boolean).length;
    }
    return count;
  }, [searchParams]);

  return {
    filters,
    setFilter,
    setFilters,
    toggleInList,
    isInList,
    clearAll,
    activeCount,
    isPending,
  };
}
