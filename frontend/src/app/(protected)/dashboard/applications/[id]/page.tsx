import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarCheck, CheckCircle2, Info, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Container } from '@/components/shared/container';
import { StatusTimeline } from '@/features/adoptions/components/status-timeline';
import { WithdrawButton } from '@/features/adoptions/components/withdraw-button';
import { adoptionsServer } from '@/services/adoptions.server';
import { isApiError } from '@/services/api-error';
import { canWithdraw, STATUS_META } from '@/types/adoption';

export const metadata: Metadata = {
  title: 'Application',
  robots: { index: false, follow: false },
};

const HOUSING_LABELS: Record<string, string> = {
  house: 'House',
  apartment: 'Apartment',
  condo: 'Condo',
  other: 'Other',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  none: 'First-time owner',
  some: 'Some experience',
  experienced: 'Very experienced',
};

function Answer({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; already?: string }>;
}) {
  const { id } = await params;
  const { submitted, already } = await searchParams;

  let application;
  try {
    application = await adoptionsServer.get(id);
  } catch (error) {
    // The API scopes by owner, so someone else's application is a 404 — deliberately
    // indistinguishable from one that does not exist.
    if (isApiError(error) && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  const { answers, pet, shelter } = application;
  const statusMeta = STATUS_META[application.status];

  return (
    <Container width="lg" className="py-8 sm:py-12">
      <Link
        href="/dashboard/applications"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        All applications
      </Link>

      {/* Doubles as the success page — no separate route needed after submitting. */}
      {submitted ? (
        <Alert className="border-success/40 bg-success/10 mb-6">
          <CheckCircle2 className="text-success size-4" />
          <AlertTitle>Application sent</AlertTitle>
          <AlertDescription>
            {shelter?.name ?? 'The shelter'} has your application and will be in touch. We have
            emailed you a copy of this confirmation.
          </AlertDescription>
        </Alert>
      ) : null}

      {already ? (
        <Alert className="mb-6">
          <Info className="size-4" />
          <AlertTitle>You have already applied for {pet?.name}</AlertTitle>
          <AlertDescription>Here is the application you submitted.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="flex flex-col gap-8">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>
            <h1 className="text-3xl font-extrabold">
              Application for {pet?.name ?? 'a pet'}
            </h1>
            <p className="text-muted-foreground mt-1">{statusMeta.description}</p>
          </div>

          {application.meetingScheduledAt ? (
            <Alert>
              <CalendarCheck className="size-4" />
              <AlertTitle>Meeting scheduled</AlertTitle>
              <AlertDescription>
                {new Date(application.meetingScheduledAt).toLocaleString('en-US', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <section aria-labelledby="progress-heading">
            <h2 id="progress-heading" className="mb-4 text-xl font-bold">
              Progress
            </h2>
            <StatusTimeline application={application} />
          </section>

          <Separator />

          <section aria-labelledby="answers-heading">
            <h2 id="answers-heading" className="mb-4 text-xl font-bold">
              Your answers
            </h2>

            <dl className="grid gap-3 sm:grid-cols-2">
              <Answer label="Housing" value={HOUSING_LABELS[answers.housingType] ?? answers.housingType} />
              <Answer label="Own or rent" value={answers.ownOrRent === 'own' ? 'Owned' : 'Rented'} />
              <Answer label="Garden" value={answers.hasYard ? 'Yes' : 'No'} />
              <Answer label="Household size" value={`${answers.householdSize} people`} />
              <Answer
                label="Children"
                value={
                  answers.hasChildren
                    ? `Yes — ages ${(answers.childrenAges ?? []).join(', ')}`
                    : 'No children'
                }
              />
              <Answer
                label="Experience"
                value={EXPERIENCE_LABELS[answers.experienceLevel] ?? answers.experienceLevel}
              />
              <Answer label="Hours alone per day" value={`${answers.hoursAlonePerDay} hours`} />
              {answers.vetName ? <Answer label="Vet" value={answers.vetName} /> : null}
            </dl>

            {answers.otherPets ? (
              <div className="mt-3">
                <h3 className="text-muted-foreground mb-1 text-xs">Other pets</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line">{answers.otherPets}</p>
              </div>
            ) : null}

            {answers.previousPets ? (
              <div className="mt-3">
                <h3 className="text-muted-foreground mb-1 text-xs">Previous pets</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line">{answers.previousPets}</p>
              </div>
            ) : null}

            <div className="mt-4">
              <h3 className="text-muted-foreground mb-1 text-xs">Why this pet</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {answers.reasonForAdopting}
              </p>
            </div>

            {application.references.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-muted-foreground mb-2 text-xs">References</h3>
                <ul className="flex flex-col gap-2">
                  {application.references.map((reference, index) => (
                    <li key={index} className="bg-muted/40 rounded-xl p-3 text-sm">
                      <p className="font-medium">{reference.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {reference.relationship} · {reference.phone}
                        {reference.email ? ` · ${reference.email}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {canWithdraw(application.status) ? (
            <>
              <Separator />
              <WithdrawButton applicationId={application.id} petName={pet?.name ?? 'this pet'} />
            </>
          ) : null}
        </div>

        <aside>
          <div className="bg-card shadow-soft rounded-2xl border p-4 lg:sticky lg:top-24">
            {pet ? (
              <>
                <div className="flex gap-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                    <Image src={pet.image} alt="" fill sizes="80px" className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">
                      <Link href={`/pets/${pet.slug}`} className="hover:text-primary-strong transition-colors">
                        {pet.name}
                      </Link>
                    </h2>
                    <p className="text-muted-foreground truncate text-sm">{pet.breed}</p>
                    <Badge variant="outline" className="mt-1 capitalize">
                      {pet.status}
                    </Badge>
                  </div>
                </div>
                <Separator className="my-4" />
              </>
            ) : null}

            {shelter ? (
              <div>
                <p className="text-muted-foreground mb-1 text-xs">Shelter</p>
                <Link
                  href={`/shelters/${shelter.slug}`}
                  className="hover:text-primary-strong flex items-center gap-1.5 font-medium transition-colors"
                >
                  <MapPin className="size-4 shrink-0" />
                  {shelter.name}
                </Link>
              </div>
            ) : null}

            {application.reviewNote ? (
              <div className="bg-muted/50 mt-4 rounded-xl p-3">
                <p className="text-muted-foreground mb-1 text-xs">Note from the shelter</p>
                <p className="text-sm leading-relaxed">{application.reviewNote}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </Container>
  );
}
