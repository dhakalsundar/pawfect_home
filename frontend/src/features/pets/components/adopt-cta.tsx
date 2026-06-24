import Link from 'next/link';
import { CalendarCheck, CheckCircle2, Heart, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from './favorite-button';
import { ShareButton } from './share-button';
import { formatCurrency } from '@/lib/currency';
import type { PetDetail } from '@/types/pet';

function feeLabel(fee: number) {
  // adoptionFee is whole rupees, not minor units.
  return fee > 0 ? formatCurrency(fee, { minorUnits: false }) : 'No fee';
}

/**
 * The conversion block. Rendered twice: inline in the sidebar on desktop, and pinned to the bottom
 * of the viewport on mobile where the sidebar is far below the fold.
 */
export function AdoptCta({
  pet,
  existingApplication,
}: {
  pet: PetDetail;
  existingApplication?: { id: string; status: string } | null;
}) {
  const available = pet.status === 'available';

  return (
    <div className="bg-card shadow-soft rounded-2xl border p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">Adoption fee</p>
          <p className="text-2xl font-extrabold">{feeLabel(pet.adoptionFee)}</p>
        </div>
        {pet.applicationsCount > 0 ? (
          <p className="text-muted-foreground text-right text-xs">
            {pet.applicationsCount} {pet.applicationsCount === 1 ? 'application' : 'applications'}
            <br />
            so far
          </p>
        ) : null}
      </div>

      {existingApplication ? (
        // Offering "Apply" to someone who already has an open application would send them into a
        // form that can only end in a 409.
        <div className="flex flex-col gap-2">
          <div className="bg-success/10 text-success flex items-start gap-2.5 rounded-xl p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>You have already applied for {pet.name}.</p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/dashboard/applications/${existingApplication.id}`}>
              View your application
            </Link>
          </Button>
        </div>
      ) : available ? (
        <Button
          asChild
          size="lg"
          className="bg-brand-gradient hover:shadow-glow w-full border-0 text-white transition-shadow"
        >
          <Link href={`/adopt/${pet.slug}`}>
            <Heart className="fill-current" />
            Apply to adopt {pet.name}
          </Link>
        </Button>
      ) : (
        <div className="bg-muted text-muted-foreground flex items-start gap-2.5 rounded-xl p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {pet.name} is currently <span className="text-foreground font-medium">{pet.status}</span>
            {pet.status === 'adopted'
              ? ' and has found a home. Plenty of others are still waiting.'
              : ' and is not accepting new applications right now.'}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {/* The heart is positioned absolutely inside cards; here it sits in normal flow. */}
        <div className="relative flex-1">
          <FavoriteButton
            petId={pet.id}
            petName={pet.name}
            className="static size-auto w-full justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </div>
        <ShareButton petName={pet.name} title={`${pet.name} — ${pet.breed} for adoption`} />
      </div>

      <p className="text-muted-foreground mt-4 flex items-start gap-2 text-xs leading-relaxed">
        <CalendarCheck className="mt-0.5 size-3.5 shrink-0" />
        Applying is free and non-binding. The shelter will contact you to arrange a meeting before
        anything is decided.
      </p>
    </div>
  );
}

/** Pinned bar for small screens, where the sidebar CTA is far below the fold. */
export function MobileAdoptBar({ pet }: { pet: PetDetail }) {
  if (pet.status !== 'available') return null;

  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t p-3 lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{pet.name}</p>
        <p className="text-muted-foreground text-xs">{feeLabel(pet.adoptionFee)}</p>
      </div>
      <Button asChild className="bg-brand-gradient shrink-0 border-0 text-white">
        <Link href={`/adopt/${pet.slug}`}>
          <Heart className="fill-current" />
          Apply to adopt
        </Link>
      </Button>
    </div>
  );
}
