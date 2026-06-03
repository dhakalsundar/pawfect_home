'use client';

import { useEffect, useState } from 'react';

/**
 * Delays propagating a rapidly-changing value.
 *
 * Used by the search box: without it, every keystroke would push a new URL and fire a server
 * fetch, so typing "golden retriever" issues sixteen requests and floods the history stack.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // Cleanup cancels the pending update, so only the final pause in typing gets through.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
