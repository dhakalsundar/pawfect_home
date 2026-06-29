import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { PetToolbar } from '@/features/pets/components/pet-toolbar';
import { PetFiltersPanel } from '@/features/pets/components/pet-filters';
import { PetResults } from '@/features/pets/components/pet-results';
import { petsServer } from '@/services/pets.server';
import type { PetQuery } from '@/types/pet';
import { favoritesServer } from '@/services/favorites.server';
import { SPECIES_LABELS, type Species } from '@/types/pet';

export const metadata: Metadata = {
  title: 'Browse pets',
  description:
    'Search adoptable dogs, cats, birds and rabbits from verified shelters. Filter by species, age, size, location and temperament.',
  alternates: { canonical: '/pets' },
};

type SearchParams = Record<string, string | string[] | undefined>;

/** searchParams values may be string | string[]; take the first if repeated. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toQuery(params: SearchParams): PetQuery {
  const num = (key: string) => {
    const raw = one(params[key]);
    return raw === undefined ? undefined : Number(raw);
  };
  const flag = (key: string) => (one(params[key]) === 'true' ? true : undefined);

  return {
    q: one(params.q),
    species: one(params.species),
    gender: one(params.gender),
    size: one(params.size),
    activityLevel: one(params.activityLevel),
    breed: one(params.breed),
    city: one(params.city),
    state: one(params.state),
    minAge: num('minAge'),
    maxAge: num('maxAge'),
    minFee: num('minFee'),
    maxFee: num('maxFee'),
    goodWithKids: flag('goodWithKids'),
    goodWithDogs: flag('goodWithDogs'),
    goodWithCats: flag('goodWithCats'),
    vaccinated: flag('vaccinated'),
    neutered: flag('neutered'),
    specialNeeds: flag('specialNeeds'),
    sort: one(params.sort) ?? 'newest',
    page: num('page') ?? 1,
    limit: 24,
  };
}

/**
 * Server Component. Reads the filter state from the URL and renders the matching page of results,
 * so the first paint is already correct — no client fetch, no loading flash, and the URL is
 * shareable and back-button friendly.
 */
export default async function PetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = toQuery(params);

  // Facets are scoped by the "context" filters only (search, species, location) rather than every
  // active filter. Otherwise ticking "Dog" would drop every other species to zero and the user
  // could never find their way back out.
  const [{ items, meta }, facets, favoritedIds] = await Promise.all([
    petsServer.listServer(query),
    petsServer.facetsServer({
      q: query.q,
      species: query.species,
      city: query.city,
      state: query.state,
    }),
    // Returns [] when signed out, so no auth branch is needed here.
    favoritesServer.ids(),
  ]);

  const speciesFilter = query.species?.split(',')[0] as Species | undefined;
  const heading =
    speciesFilter && SPECIES_LABELS[speciesFilter]
      ? `${SPECIES_LABELS[speciesFilter]}s looking for a home`
      : 'Pets looking for a home';

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold sm:text-4xl">{heading}</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-pretty">
          Every listing comes from a shelter we have verified. Save the ones you like, then apply in
          minutes.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sticky sidebar on desktop; the mobile equivalent lives in the toolbar's sheet. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2 pb-8">
            <PetFiltersPanel facets={facets} />
          </div>
        </aside>

        <div className="flex flex-col gap-6">
          <PetToolbar total={meta.total} facets={facets} />
          <PetResults pets={items} meta={meta} favoritedIds={favoritedIds} />
        </div>
      </div>
    </Container>
  );
}
