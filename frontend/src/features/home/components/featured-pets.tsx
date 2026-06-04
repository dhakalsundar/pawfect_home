import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeader } from '@/components/shared/section';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { PetCard } from '@/features/pets/components/pet-card';
import { PetGridSkeleton } from '@/features/pets/components/pet-grid-skeleton';
import { petsServer } from '@/services/pets.server';
import type { Pet } from '@/types/pet';

function Header() {
  return (
    <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
      <SectionHeader
        align="left"
        eyebrow="Meet them"
        title={<span id="featured-heading">Pets looking for a home</span>}
        description="A few of the animals currently waiting at partner shelters near you."
        className="mb-0"
      />
      <Button asChild variant="outline" className="group shrink-0">
        <Link href="/pets">
          View all pets
          <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </div>
  );
}

/** Shown while the API call is in flight, and if it fails entirely. */
export function FeaturedPetsSkeleton() {
  return (
    <Section aria-labelledby="featured-heading">
      <Header />
      <PetGridSkeleton count={4} />
    </Section>
  );
}

/**
 * Async Server Component behind its own Suspense boundary in the page, so the rest of the home
 * page paints immediately rather than waiting on this one request.
 */
export async function FeaturedPets() {
  let pets: Pet[] = [];

  try {
    pets = await petsServer.featuredServer();
  } catch {
    // A marketing section is not worth failing the whole page over. Falling through renders
    // nothing, which is better than an error screen on the home page.
    return null;
  }

  if (pets.length === 0) return null;

  return (
    <Section aria-labelledby="featured-heading">
      <Header />
      <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {pets.slice(0, 8).map((pet, index) => (
          <StaggerItem key={pet.id}>
            {/* The first row sits above the fold on desktop, so those images skip lazy loading. */}
            <PetCard pet={pet} priority={index < 4} />
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
