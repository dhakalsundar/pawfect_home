import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Clock, Info, MapPin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/shared/container';
import { AdoptionForm } from '@/features/adoptions/components/adoption-form';
import { petsServer } from '@/services/pets.server';
import { adoptionsServer } from '@/services/adoptions.server';
import { requireSession } from '@/services/session';
import { isApiError } from '@/services/api-error';
import { formatAge } from '@/types/pet';
import { formatCurrency } from '@/lib/currency';

export const metadata: Metadata = {
  title: 'Apply to adopt',
  robots: { index: false, follow: false },
};

export default async function AdoptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // middleware.ts already bounced anonymous visitors; this is the check that actually counts.
  await requireSession(`/adopt/${slug}`);

  let pet;
  try {
    pet = await petsServer.getBySlugServer(slug);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }

  // Sending someone through a five-minute form for a pet that has already gone would be cruel.
  if (pet.status !== 'available') {
    return (
      <Container width="md" className="py-12">
        <Alert>
          <Info className="size-4" />
          <AlertTitle>{pet.name} is no longer accepting applications</AlertTitle>
          <AlertDescription>
            This pet is currently {pet.status}. There are plenty of others still looking.
          </AlertDescription>
        </Alert>
        <div className="mt-6 flex gap-3">
          <Button asChild className="bg-brand-gradient border-0 text-white">
            <Link href="/pets">Browse other pets</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/pets/${pet.slug}`}>Back to {pet.name}</Link>
          </Button>
        </div>
      </Container>
    );
  }

  // Straight to the existing application rather than letting them fill in a form that will 409.
  const existing = await adoptionsServer.forPet(pet.id);
  if (existing) redirect(`/dashboard/applications/${existing.id}?already=1`);

  return (
    <Container width="lg" className="py-8 sm:py-12">
      <Link
        href={`/pets/${pet.slug}`}
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to {pet.name}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="order-2 lg:order-1">
          <h1 className="mb-2 text-3xl font-extrabold">Apply to adopt {pet.name}</h1>
          <p className="text-muted-foreground mb-8 text-pretty">
            About five minutes. Your answers go straight to{' '}
            {pet.shelterDetail?.name ?? 'the shelter'}, who will get back to you directly.
          </p>

          <AdoptionForm pet={pet} />
        </div>

        {/* Sticky reminder of who this is for — long forms make it easy to forget. */}
        <aside className="order-1 lg:order-2">
          <div className="bg-card shadow-soft rounded-2xl border p-4 lg:sticky lg:top-24">
            <div className="flex gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={pet.image}
                  alt={pet.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{pet.name}</h2>
                <p className="text-muted-foreground truncate text-sm">{pet.breed}</p>
                <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                  <MapPin className="size-3 shrink-0" />
                  {pet.location.city}, {pet.location.state}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 rounded-lg px-2.5 py-2">
                <dt className="text-muted-foreground text-xs">Age</dt>
                <dd className="font-medium">{formatAge(pet.age)}</dd>
              </div>
              <div className="bg-muted/50 rounded-lg px-2.5 py-2">
                <dt className="text-muted-foreground text-xs">Fee</dt>
                <dd className="font-medium">
                  {pet.adoptionFee > 0 ? formatCurrency(pet.adoptionFee, { minorUnits: false }) : 'No fee'}
                </dd>
              </div>
            </dl>

            <p className="text-muted-foreground mt-4 flex items-start gap-2 text-xs leading-relaxed">
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              Your answers save automatically as you go, so you can finish later.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
