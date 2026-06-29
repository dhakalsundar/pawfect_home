import { Skeleton } from '@/components/ui/skeleton';
import { Container } from '@/components/shared/container';

/** Mirrors the detail layout so the swap-in causes no shift. */
export default function Loading() {
  return (
    <Container className="py-6 pb-24 sm:py-8 lg:pb-12">
      <Skeleton className="mb-6 h-4 w-64" />

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/3] rounded-2xl" />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-64" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </aside>
      </div>
    </Container>
  );
}
