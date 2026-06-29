import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, Globe, Mail, MapPin, Phone, Star } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { MessageShelterButton } from '@/features/messages/components/message-shelter-button';
import type { PetDetail } from '@/types/pet';

type Shelter = NonNullable<PetDetail['shelterDetail']>;

function Rating({ average, count }: { average: number; count: number }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">No reviews yet</span>;

  return (
    <span className="flex items-center gap-1.5 text-xs">
      {/* Stars duplicate the number, so they are decorative and the value is announced once. */}
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={
              star <= Math.round(average)
                ? 'fill-amber-brand text-amber-brand size-3.5'
                : 'text-muted-foreground/30 size-3.5'
            }
          />
        ))}
      </span>
      <span className="text-muted-foreground">
        <span className="sr-only">Rated </span>
        {average.toFixed(1)} ({count} {count === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  );
}

/** Server Component — pure content apart from the message button. */
export function ShelterCard({ shelter, petId }: { shelter: Shelter; petId: string }) {
  return (
    <section
      className="bg-card shadow-soft rounded-2xl border p-5"
      aria-labelledby="shelter-heading"
    >
      <h2 id="shelter-heading" className="text-muted-foreground mb-4 text-sm font-semibold">
        Listed by
      </h2>

      <div className="flex items-start gap-3">
        {shelter.logo?.url ? (
          <Image
            src={shelter.logo.url}
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
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Link href={`/shelters/${shelter.slug}`} className="hover:text-primary-strong transition-colors">
              {shelter.name}
            </Link>
            <BadgeCheck className="text-success size-4 shrink-0" aria-label="Verified shelter" />
          </h3>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <MapPin className="size-3 shrink-0" />
            {shelter.city}, {shelter.state}
          </p>
          <div className="mt-1.5">
            <Rating average={shelter.rating.average} count={shelter.rating.count} />
          </div>
        </div>
      </div>

      {shelter.description ? (
        <p className="text-muted-foreground mt-4 line-clamp-3 text-sm leading-relaxed">
          {shelter.description}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="bg-muted/50 rounded-xl px-3 py-2">
          <p className="text-lg font-bold tabular-nums">{shelter.availablePets}</p>
          <p className="text-muted-foreground text-xs">Available now</p>
        </div>
        <div className="bg-muted/50 rounded-xl px-3 py-2">
          <p className="text-lg font-bold tabular-nums">{shelter.adoptedPets}</p>
          <p className="text-muted-foreground text-xs">Rehomed</p>
        </div>
      </div>

      <Separator className="my-4" />

      <ul className="flex flex-col gap-2">
        {shelter.phone ? (
          <li>
            <a
              href={`tel:${shelter.phone.replace(/[^+\d]/g, '')}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors"
            >
              <Phone className="size-3.5 shrink-0" />
              {shelter.phone}
            </a>
          </li>
        ) : null}
        {shelter.email ? (
          <li>
            <a
              href={`mailto:${shelter.email}`}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 truncate text-sm transition-colors"
            >
              <Mail className="size-3.5 shrink-0" />
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
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 truncate text-sm transition-colors"
            >
              <Globe className="size-3.5 shrink-0" />
              {shelter.website.replace(/^https?:\/\//, '')}
            </a>
          </li>
        ) : null}
      </ul>

      {/* The only interactive leaf on this card — the rest stays a Server Component. */}
      <MessageShelterButton petId={petId} />
    </section>
  );
}
