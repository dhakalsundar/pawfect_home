import { PetCard } from './pet-card';
import { PetGridSkeleton } from './pet-grid-skeleton';
import { petsServer } from '@/services/pets.server';
import { SPECIES_LABELS, type Species } from '@/types/pet';

function Heading({ species }: { species: Species }) {
  return (
    <h2 id="similar-heading" className="text-2xl font-bold">
      More {SPECIES_LABELS[species].toLowerCase()}s nearby
    </h2>
  );
}

export function SimilarPetsSkeleton({ species }: { species: Species }) {
  return (
    <section aria-labelledby="similar-heading" className="flex flex-col gap-6">
      <Heading species={species} />
      <PetGridSkeleton count={4} />
    </section>
  );
}

/**
 * Async Server Component behind its own Suspense boundary, so the pet's own details paint without
 * waiting on this secondary request.
 */
export async function SimilarPets({ slug, species }: { slug: string; species: Species }) {
  let pets = [];

  try {
    pets = await petsServer.similarServer(slug);
  } catch {
    // A recommendations strip is not worth failing the page over.
    return null;
  }

  if (pets.length === 0) return null;

  return (
    <section aria-labelledby="similar-heading" className="flex flex-col gap-6">
      <Heading species={species} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {pets.slice(0, 4).map((pet) => (
          <PetCard key={pet.id} pet={pet} />
        ))}
      </div>
    </section>
  );
}
