import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Syringe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FavoriteButton } from './favorite-button';
import { formatAge, SPECIES_LABELS, type Pet } from '@/types/pet';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * Server Component. Only the favourite heart hydrates, so a 24-card grid ships one small bundle
 * rather than 24 interactive components.
 */
export function PetCard({
  pet,
  priority = false,
  layout = 'grid',
  favorited = false,
  refreshOnFavorite = false,
}: {
  pet: Pet;
  priority?: boolean;
  layout?: 'grid' | 'list';
  /** Resolved on the server so the heart renders filled on first paint, not after a fetch. */
  favorited?: boolean;
  refreshOnFavorite?: boolean;
}) {
  const unavailable = pet.status !== 'available';

  if (layout === 'list') {
    return (
      <article className="group bg-card hover-lift relative flex gap-4 overflow-hidden rounded-2xl border p-3 sm:gap-5 sm:p-4">
        <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-xl sm:w-40">
          <Image
            src={pet.image}
            alt={`${pet.name}, a ${pet.breed}`}
            fill
            sizes="(max-width: 640px) 112px, 160px"
            className={cn('object-cover', unavailable && 'grayscale')}
            priority={priority}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">
                <Link href={`/pets/${pet.slug}`} className="after:absolute after:inset-0">
                  {pet.name}
                </Link>
              </h3>
              <p className="text-muted-foreground truncate text-sm">{pet.breed}</p>
            </div>
            <span className="text-primary-strong shrink-0 font-semibold">
              {pet.adoptionFee > 0 ? formatCurrency(pet.adoptionFee, { minorUnits: false }) : 'Free'}
            </span>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span>{SPECIES_LABELS[pet.species]}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{pet.gender}</span>
            <span aria-hidden="true">·</span>
            <span>{formatAge(pet.age)}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{pet.size}</span>
          </div>

          {pet.temperament.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {pet.temperament.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[11px] capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          <p className="text-muted-foreground mt-auto flex items-center gap-1 text-xs">
            <MapPin className="size-3 shrink-0" />
            {pet.location.city}, {pet.location.state}
          </p>
        </div>

        <FavoriteButton
          petId={pet.id}
          petName={pet.name}
          initialFavorited={favorited}
          refreshOnChange={refreshOnFavorite}
          className="top-4 right-4"
        />
      </article>
    );
  }

  return (
    <article className="group bg-card hover-lift relative flex flex-col overflow-hidden rounded-2xl border">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={pet.image}
          alt={`${pet.name}, a ${pet.breed}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className={cn(
            'object-cover transition-transform duration-500 group-hover:scale-105',
            unavailable && 'grayscale',
          )}
          priority={priority}
        />

        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Badge className="bg-background/85 text-foreground border-0 backdrop-blur-sm">
            {SPECIES_LABELS[pet.species]}
          </Badge>
          {pet.health.vaccinated ? (
            <Badge className="bg-success/90 gap-1 border-0 text-white">
              <Syringe className="size-3" />
              Vaccinated
            </Badge>
          ) : null}
          {unavailable ? (
            <Badge className="bg-foreground/80 border-0 text-white capitalize backdrop-blur-sm">
              {pet.status}
            </Badge>
          ) : null}
        </div>

        <FavoriteButton
          petId={pet.id}
          petName={pet.name}
          initialFavorited={favorited}
          refreshOnChange={refreshOnFavorite}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">
              <Link href={`/pets/${pet.slug}`} className="after:absolute after:inset-0">
                {pet.name}
              </Link>
            </h3>
            <p className="text-muted-foreground truncate text-sm">{pet.breed}</p>
          </div>
          <span className="text-primary-strong shrink-0 text-sm font-semibold">
            {pet.adoptionFee > 0 ? formatCurrency(pet.adoptionFee, { minorUnits: false }) : 'Free'}
          </span>
        </div>

        <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="capitalize">{pet.gender}</span>
          <span aria-hidden="true">·</span>
          <span>{formatAge(pet.age)}</span>
          <span aria-hidden="true">·</span>
          <span className="capitalize">{pet.size}</span>
        </div>

        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <MapPin className="size-3 shrink-0" />
          {pet.location.city}, {pet.location.state}
        </p>
      </div>
    </article>
  );
}
