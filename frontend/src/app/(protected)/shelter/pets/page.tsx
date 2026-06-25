import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, Heart, PawPrint, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PetRowActions } from '@/features/shelter/components/pet-row-actions';
import { shelterServer } from '@/services/shelter.server';
import { formatAge, SPECIES_LABELS, type PetStatus } from '@/types/pet';
import { formatCurrency } from '@/lib/currency';

export const metadata: Metadata = {
  title: 'My pets',
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<PetStatus, string> = {
  pending: 'bg-warning/15 text-warning border-0',
  available: 'bg-success/10 text-success border-0',
  reserved: 'bg-info/10 text-info border-0',
  adopted: 'bg-brand-100 text-brand-700 border-0',
  archived: 'bg-muted text-muted-foreground border-0',
};

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'archived', label: 'Archived' },
];

export default async function ShelterPetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { items, meta } = await shelterServer.pets({ status, limit: 48 });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My pets</h1>
          <p className="text-muted-foreground mt-1">
            {meta.total} listing{meta.total === 1 ? '' : 's'}
            {status ? ` · ${status}` : ''}
          </p>
        </div>
        <Button asChild className="bg-brand-gradient gap-1.5 border-0 text-white">
          <Link href="/shelter/pets/new">
            <Plus className="size-4" />
            Add a pet
          </Link>
        </Button>
      </div>

      {/* Links rather than client-side state, so a filtered view is a shareable URL. */}
      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (status ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/shelter/pets?status=${filter.value}` : '/shelter/pets'}
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
          title={status ? `No ${status} listings` : 'No pets listed yet'}
          description={
            status
              ? 'Try a different filter.'
              : 'Add your first pet and it will appear here while it awaits approval.'
          }
          action={
            !status ? (
              <Button asChild className="bg-brand-gradient border-0 text-white">
                <Link href="/shelter/pets/new">Add a pet</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((pet) => (
            <li
              key={pet.id}
              className="bg-card flex items-center gap-4 rounded-2xl border p-3 sm:p-4"
            >
              <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl">
                {pet.image ? (
                  <Image src={pet.image} alt="" fill sizes="64px" className="object-cover" unoptimized />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold">{pet.name}</h2>
                  <Badge className={STATUS_TONE[pet.status]}>{pet.status}</Badge>
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  {SPECIES_LABELS[pet.species]} · {pet.breed} · {formatAge(pet.age)}
                </p>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs tabular-nums">
                  <span className="flex items-center gap-1">
                    <Eye className="size-3" />
                    {pet.favoritesCount === 0 && pet.status === 'pending' ? '—' : pet.favoritesCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="size-3" />
                    {pet.favoritesCount}
                  </span>
                  <span>{pet.adoptionFee > 0 ? formatCurrency(pet.adoptionFee, { minorUnits: false }) : 'No fee'}</span>
                </p>
              </div>

              <PetRowActions pet={pet} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
