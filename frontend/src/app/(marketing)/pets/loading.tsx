import { Skeleton } from '@/components/ui/skeleton';
import { Container } from '@/components/shared/container';
import { PetFiltersSkeleton, PetGridSkeleton } from '@/features/pets/components/pet-grid-skeleton';

export default function Loading() {
  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <PetFiltersSkeleton />
        </aside>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-36 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
          </div>
          <PetGridSkeleton count={12} />
        </div>
      </div>
    </Container>
  );
}
