import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors PetCard's exact structure and spacing. A generic spinner would let the page jump when
 * real content arrives; matching the shape keeps CLS at zero.
 */
export function PetGridSkeleton({ count = 12, layout = 'grid' }: { count?: number; layout?: 'grid' | 'list' }) {
  if (layout === 'list') {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border p-3 sm:gap-5 sm:p-4">
            <Skeleton className="aspect-square w-28 shrink-0 rounded-xl sm:w-40" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="mt-auto h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PetFiltersSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-9 w-full rounded-lg" />
      {Array.from({ length: 4 }, (_, group) => (
        <div key={group} className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 4 }, (_, row) => (
            <Skeleton key={row} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
