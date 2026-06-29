import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, MapPin, PawPrint } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { StarRating } from '@/features/reviews/components/star-rating';
import { sheltersServer } from '@/services/shelters.server';

export const metadata: Metadata = {
  title: 'Shelters',
  description:
    'Browse the verified rescues and shelters on PawfectHome. Every one is checked before it can list a pet.',
  alternates: { canonical: '/shelters' },
};

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}

export default async function SheltersPage({ searchParams }: PageProps) {
  const { q, sort, page } = await searchParams;
  const { items, meta } = await sheltersServer.list({
    ...(q ? { q } : {}),
    ...(sort ? { sort } : {}),
    page: Number(page) || 1,
  });

  return (
    <Container className="py-10">
      {/* `.reveal`, not motion — this is above the fold and must render without JavaScript. */}
      <div className="reveal mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight">Verified shelters</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          Every shelter here is checked before it can list a pet. {meta.total} are currently active.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-muted-foreground rounded-2xl border border-dashed p-12 text-center">
          <PawPrint className="mx-auto mb-4 size-10 opacity-40" aria-hidden />
          <p className="text-foreground font-medium">No shelters found</p>
          <p className="mt-1 text-sm">Try a different search.</p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((shelter) => (
            <li key={shelter.id}>
              <Link
                href={`/shelters/${shelter.slug}`}
                className="bg-card shadow-soft hover-lift focus-visible:ring-ring flex h-full flex-col rounded-2xl border p-5 transition-shadow focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="flex items-start gap-3">
                  {shelter.logo ? (
                    <Image
                      src={shelter.logo}
                      alt=""
                      width={48}
                      height={48}
                      className="size-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="bg-brand-gradient grid size-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-white">
                      {shelter.name.charAt(0)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{shelter.name}</span>
                      {shelter.verifiedAt ? (
                        <BadgeCheck className="text-success size-4 shrink-0" aria-label="Verified" />
                      ) : null}
                    </h2>
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      {shelter.city}, {shelter.state}
                    </p>
                    {shelter.rating.count > 0 ? (
                      <span className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <StarRating value={shelter.rating.average} size="sm" />
                        <span className="text-muted-foreground">
                          {shelter.rating.average.toFixed(1)} ({shelter.rating.count})
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground mt-1.5 block text-xs">No reviews yet</span>
                    )}
                  </div>
                </div>

                <p className="text-muted-foreground mt-4 line-clamp-3 flex-1 text-sm leading-relaxed">
                  {shelter.description}
                </p>

                <p className="text-primary-strong mt-4 text-sm font-medium">
                  {shelter.stats.availablePets} pets available
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
