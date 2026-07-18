import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, PawPrint, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PetModerationActions } from '@/features/admin/components/pet-moderation-actions';
import { adminServer } from '@/services/admin.server';
import { formatAge, SPECIES_LABELS, type PetStatus } from '@/types/pet';

export const metadata: Metadata = {
  title: 'Listings',
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<PetStatus, string> = {
  pending: 'bg-warning/15 text-warning border-0',
  available: 'bg-success/10 text-success border-0',
  reserved: 'bg-info/10 text-info border-0',
  adopted: 'bg-brand-100 text-brand-700 border-0',
  archived: 'bg-muted text-muted-foreground border-0',
};

const FILTERS = [
  { value: 'pending', label: 'Awaiting approval' },
  { value: '', label: 'All' },
  { value: 'available', label: 'Live' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'archived', label: 'Archived' },
];

export default async function AdminPetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { items, meta } = await adminServer.pets({ status });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Listings</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total.toLocaleString()} listing{meta.total === 1 ? '' : 's'}
          {status ? ` · ${status}` : ''}
        </p>
      </div>

      <nav aria-label="Filter listings" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (status ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/admin/pets?status=${filter.value}` : '/admin/pets'}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-brand-50 text-primary-strong rounded-lg px-3 py-1.5 text-sm font-medium'
                  : 'text-muted-foreground hover:bg-muted rounded-lg px-3 py-1.5 text-sm transition-colors'
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title={status === 'pending' ? 'Nothing awaiting approval' : 'No listings match'}
          description={
            status === 'pending'
              ? 'New listings from shelters will appear here for review.'
              : 'Try a different filter.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((pet) => (
            <li key={pet.id} className="bg-card rounded-2xl border p-4">
              <div className="flex gap-4">
                <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-xl">
                  {pet.image ? (
                    <Image src={pet.image} alt="" fill sizes="80px" className="object-cover" unoptimized />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{pet.name}</h2>
                    <Badge className={STATUS_TONE[pet.status]}>{pet.status}</Badge>
                    {pet.featured ? (
                      <Badge className="bg-brand-gradient gap-1 border-0 text-white">
                        <Star className="size-3 fill-current" />
                        Featured
                      </Badge>
                    ) : null}
                  </div>

                  <p className="text-muted-foreground truncate text-sm">
                    {SPECIES_LABELS[pet.species]} · {pet.breed} · {formatAge(pet.age)} ·{' '}
                    {pet.location.city}
                  </p>

                  {pet.shelter ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Listed by {pet.shelter.name}
                    </p>
                  ) : null}

                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {/* The moderation decision hinges on the description, so show a slice of it. */}
                    {pet.temperament.join(', ')}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <PetModerationActions
                      petId={pet.id}
                      name={pet.name}
                      status={pet.status}
                      featured={pet.featured}
                    />
                    <Link
                      href={`/pets/${pet.slug}`}
                      target="_blank"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                    >
                      <ExternalLink className="size-3" />
                      View listing
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
