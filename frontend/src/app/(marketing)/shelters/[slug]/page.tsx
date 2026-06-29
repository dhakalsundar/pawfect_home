import { Suspense } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Separator } from '@/components/ui/separator';
import { StarRating } from '@/features/reviews/components/star-rating';
import {
  ShelterReviews,
  ShelterReviewsSkeleton,
} from '@/features/reviews/components/shelter-reviews';
import { sheltersServer } from '@/services/shelters.server';
import { isApiError } from '@/services/api-error';
import { siteConfig } from '@/config/site';
import type { PublicShelter } from '@/types/shelter';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadShelter(slug: string): Promise<PublicShelter> {
  try {
    return await sheltersServer.bySlug(slug);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let shelter: PublicShelter;
  try {
    shelter = await sheltersServer.bySlug(slug);
  } catch {
    return { title: 'Shelter not found', robots: { index: false, follow: false } };
  }

  const description =
    `${shelter.name} in ${shelter.city}, ${shelter.state} — ` +
    `${shelter.stats.availablePets} pets looking for homes. ${shelter.description.slice(0, 120)}`;

  const image = shelter.coverImage ?? shelter.logo;

  return {
    title: shelter.name,
    description,
    alternates: { canonical: `/shelters/${shelter.slug}` },
    openGraph: {
      title: shelter.name,
      description,
      url: `/shelters/${shelter.slug}`,
      type: 'profile',
      images: image ? [{ url: image }] : undefined,
    },
  };
}

/** LocalBusiness is the closest schema.org type search engines actually understand for a rescue. */
function StructuredData({ shelter }: { shelter: PublicShelter }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: shelter.name,
    description: shelter.description,
    url: `${siteConfig.url}/shelters/${shelter.slug}`,
    ...(shelter.logo ? { image: shelter.logo } : {}),
    ...(shelter.email ? { email: shelter.email } : {}),
    ...(shelter.phone ? { telephone: shelter.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: shelter.city,
      addressRegion: shelter.state,
      addressCountry: shelter.country,
    },
    // Omitted entirely when there are no reviews — an aggregateRating of 0 is worse than none,
    // and Google flags a rating with no reviews behind it.
    ...(shelter.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: shelter.rating.average,
            reviewCount: shelter.rating.count,
          },
        }
      : {}),
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

export default async function ShelterDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const shelter = await loadShelter(slug);

  return (
    <>
      <StructuredData shelter={shelter} />

      {shelter.coverImage ? (
        <div className="relative h-48 w-full sm:h-64">
          <Image
            src={shelter.coverImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <Container className="py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {shelter.logo ? (
            <Image
              src={shelter.logo}
              alt=""
              width={80}
              height={80}
              className="size-20 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <span className="bg-brand-gradient grid size-20 shrink-0 place-items-center rounded-2xl text-2xl font-bold text-white">
              {shelter.name.charAt(0)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold tracking-tight">
              {shelter.name}
              {shelter.verifiedAt ? (
                <BadgeCheck className="text-success size-6" aria-label="Verified shelter" />
              ) : null}
            </h1>

            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-sm">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {shelter.city}, {shelter.state}, {shelter.country}
            </p>

            {shelter.rating.count > 0 ? (
              <p className="mt-2 flex items-center gap-2 text-sm">
                <StarRating value={shelter.rating.average} />
                <span className="text-muted-foreground">
                  {shelter.rating.average.toFixed(1)} from {shelter.rating.count}{' '}
                  {shelter.rating.count === 1 ? 'review' : 'reviews'}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-muted-foreground mt-6 max-w-3xl leading-relaxed">{shelter.description}</p>

        <dl className="mt-8 grid grid-cols-2 gap-4 sm:max-w-md">
          <div className="bg-muted/50 rounded-2xl px-4 py-3 text-center">
            <dt className="text-muted-foreground text-xs">Available now</dt>
            <dd className="text-brand-gradient mt-1 text-2xl font-bold tabular-nums">
              {shelter.stats.availablePets}
            </dd>
          </div>
          <div className="bg-muted/50 rounded-2xl px-4 py-3 text-center">
            <dt className="text-muted-foreground text-xs">Rehomed</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{shelter.stats.adoptedPets}</dd>
          </div>
        </dl>

        {shelter.email || shelter.phone || shelter.website ? (
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {shelter.phone ? (
              <li>
                <a
                  href={`tel:${shelter.phone.replace(/[^+\d]/g, '')}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Phone className="size-4 shrink-0" aria-hidden />
                  {shelter.phone}
                </a>
              </li>
            ) : null}
            {shelter.email ? (
              <li>
                <a
                  href={`mailto:${shelter.email}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Mail className="size-4 shrink-0" aria-hidden />
                  {shelter.email}
                </a>
              </li>
            ) : null}
            {shelter.website ? (
              <li>
                <a
                  href={shelter.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2"
                >
                  <Globe className="size-4 shrink-0" aria-hidden />
                  {shelter.website.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-8">
          <Link
            href={`/pets?shelter=${shelter.slug}`}
            className="bg-brand-gradient inline-flex rounded-2xl px-6 py-3 font-medium text-white"
          >
            See their {shelter.stats.availablePets} pets
          </Link>
        </div>

        <Separator className="my-10" />

        {/* Scoped so the profile above never waits on the review query. */}
        <Suspense fallback={<ShelterReviewsSkeleton />}>
          <ShelterReviews shelterId={shelter.id} shelterName={shelter.name} limit={6} />
        </Suspense>
      </Container>
    </>
  );
}
