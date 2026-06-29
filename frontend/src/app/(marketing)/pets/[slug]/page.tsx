import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Eye, Heart, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Container } from '@/components/shared/container';
import { PetGallery } from '@/features/pets/components/pet-gallery';
import { PetInfo } from '@/features/pets/components/pet-info';
import { ShelterCard } from '@/features/pets/components/shelter-card';
import {
  ShelterReviews,
  ShelterReviewsSkeleton,
} from '@/features/reviews/components/shelter-reviews';
import { AdoptCta, MobileAdoptBar } from '@/features/pets/components/adopt-cta';
import { SimilarPets, SimilarPetsSkeleton } from '@/features/pets/components/similar-pets';
import { petsServer } from '@/services/pets.server';
import { adoptionsServer } from '@/services/adoptions.server';
import { isApiError } from '@/services/api-error';
import { siteConfig } from '@/config/site';
import { formatAge, SPECIES_LABELS, type PetDetail } from '@/types/pet';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fetches the pet, turning a 404 from the API into Next's notFound().
 *
 * Called by both generateMetadata and the page. React's request-level cache dedupes them, so this
 * runs once per request despite two call sites.
 */
async function loadPet(slug: string): Promise<PetDetail> {
  try {
    return await petsServer.getBySlugServer(slug);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let pet: PetDetail;
  try {
    pet = await petsServer.getBySlugServer(slug);
  } catch {
    // A missing pet still needs valid metadata; the page itself renders the 404.
    return { title: 'Pet not found', robots: { index: false, follow: false } };
  }

  const title = `${pet.name} — ${pet.breed} for adoption in ${pet.location.city}`;
  const description =
    `Meet ${pet.name}, a ${formatAge(pet.age)} old ${pet.gender} ${pet.breed.toLowerCase()} ` +
    `looking for a home in ${pet.location.city}, ${pet.location.state}. ` +
    `${pet.health.vaccinated ? 'Vaccinated. ' : ''}Apply to adopt on ${siteConfig.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/pets/${pet.slug}` },
    openGraph: {
      title,
      description,
      url: `/pets/${pet.slug}`,
      type: 'article',
      // The pet's own photo makes a far better share card than a generic site image.
      images: pet.image ? [{ url: pet.image, width: 800, height: 600, alt: pet.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: pet.image ? [pet.image] : undefined,
    },
    // Adopted pets stay reachable by link but should not attract new search traffic.
    robots: pet.status === 'available' ? { index: true, follow: true } : { index: false, follow: true },
  };
}

/** schema.org has no Pet type, so Product is the closest fit search engines actually understand. */
function StructuredData({ pet }: { pet: PetDetail }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pet.name,
    description: pet.description,
    image: pet.images.map((image) => image.url),
    category: SPECIES_LABELS[pet.species],
    offers: {
      '@type': 'Offer',
      price: pet.adoptionFee,
      priceCurrency: 'NPR',
      availability:
        pet.status === 'available'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      url: `${siteConfig.url}/pets/${pet.slug}`,
      ...(pet.shelterDetail
        ? { seller: { '@type': 'Organization', name: pet.shelterDetail.name } }
        : {}),
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Breed', value: pet.breed },
      { '@type': 'PropertyValue', name: 'Age', value: formatAge(pet.age) },
      { '@type': 'PropertyValue', name: 'Gender', value: pet.gender },
      { '@type': 'PropertyValue', name: 'Size', value: pet.size },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default async function PetDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const pet = await loadPet(slug);

  // Returns null when signed out, so this needs no auth branch of its own.
  const existingApplication = await adoptionsServer.forPet(pet.id);

  return (
    <>
      <StructuredData pet={pet} />

      {/* pb-24 on mobile clears the pinned adopt bar so it never covers the last section. */}
      <Container className="py-6 pb-24 sm:py-8 lg:pb-12">
        <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 flex items-center gap-1.5 text-sm">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <Link href="/pets" className="hover:text-foreground transition-colors">
            Pets
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <Link
            href={`/pets?species=${pet.species}`}
            className="hover:text-foreground transition-colors"
          >
            {SPECIES_LABELS[pet.species]}s
          </Link>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="text-foreground font-medium">{pet.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-8">
            <PetGallery images={pet.images} petName={pet.name} />

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SPECIES_LABELS[pet.species]}</Badge>
                {pet.featured ? (
                  <Badge className="bg-brand-gradient border-0 text-white">Featured</Badge>
                ) : null}
                {pet.status !== 'available' ? (
                  <Badge variant="outline" className="capitalize">
                    {pet.status}
                  </Badge>
                ) : null}
              </div>

              <h1 className="text-3xl font-extrabold sm:text-4xl">{pet.name}</h1>
              <p className="text-muted-foreground mt-1 text-lg">{pet.breed}</p>

              <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {pet.location.city}, {pet.location.state}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="size-4" />
                  {pet.views.toLocaleString()} views
                </span>
                {pet.favoritesCount > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <Heart className="size-4" />
                    {pet.favoritesCount} saved
                  </span>
                ) : null}
              </div>
            </div>

            <Separator />

            <PetInfo pet={pet} />
          </div>

          <aside className="flex flex-col gap-6">
            {/* Sticky so the CTA stays reachable while reading a long description. */}
            <div className="flex flex-col gap-6 lg:sticky lg:top-24">
              <AdoptCta pet={pet} existingApplication={existingApplication} />
              {pet.shelterDetail ? <ShelterCard shelter={pet.shelterDetail} petId={pet.id} /> : null}
            </div>
          </aside>
        </div>

        {pet.shelterDetail ? (
          <>
            <Separator className="my-12" />
            {/* Scoped to this section: a slow review query must not delay the pet's own details. */}
            <Suspense fallback={<ShelterReviewsSkeleton />}>
              <ShelterReviews
                shelterId={pet.shelterDetail.id}
                shelterName={pet.shelterDetail.name}
              />
            </Suspense>
          </>
        ) : null}

        <Separator className="my-12" />

        {/* Scoped Suspense: the pet's own details never wait on the recommendations query. */}
        <Suspense fallback={<SimilarPetsSkeleton species={pet.species} />}>
          <SimilarPets slug={pet.slug} species={pet.species} />
        </Suspense>
      </Container>

      <MobileAdoptBar pet={pet} />
    </>
  );
}
