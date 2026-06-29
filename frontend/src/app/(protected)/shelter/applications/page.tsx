import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Baby, Clock, Dog, Home, Inbox, Mail, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/shared/empty-state';
import { ApplicationActions } from '@/features/shelter/components/application-actions';
import { shelterServer } from '@/services/shelter.server';
import { STATUS_META } from '@/types/adoption';

export const metadata: Metadata = {
  title: 'Applications',
  robots: { index: false, follow: false },
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'New' },
  { value: 'under_review', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'completed', label: 'Adopted' },
  { value: 'rejected', label: 'Declined' },
];

const HOUSING: Record<string, string> = {
  house: 'House',
  apartment: 'Apartment',
  condo: 'Condo',
  other: 'Other',
};

const EXPERIENCE: Record<string, string> = {
  none: 'First-time owner',
  some: 'Some experience',
  experienced: 'Very experienced',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ShelterApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { items, meta } = await shelterServer.applications({ status });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Applications</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total} application{meta.total === 1 ? '' : 's'}
          {status ? ` · ${status.replace('_', ' ')}` : ''}
        </p>
      </div>

      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (status ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/shelter/applications?status=${filter.value}` : '/shelter/applications'}
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
          icon={Inbox}
          title={status ? 'Nothing in this view' : 'No applications yet'}
          description={
            status
              ? 'Try a different filter.'
              : 'When someone applies for one of your pets, it will appear here with their full answers.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((application) => {
            const meta = STATUS_META[application.status];
            const { answers } = application;

            return (
              <li key={application.id} className="bg-card shadow-soft rounded-2xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    {application.pet?.image ? (
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                        <Image
                          src={application.pet.image}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {application.applicantSnapshot.name}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          → {application.pet?.name ?? 'a pet'}
                        </span>
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {application.applicantSnapshot.email}
                        </span>
                        {application.applicantSnapshot.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3" />
                            {application.applicantSnapshot.phone}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDate(application.createdAt)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <Badge className={meta.tone}>{meta.label}</Badge>
                </div>

                <Separator className="my-4" />

                {/* The answers a shelter actually screens on, surfaced without a click. */}
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-2">
                    <Home className="text-muted-foreground size-4 shrink-0" />
                    <div>
                      <dt className="text-muted-foreground text-xs">Home</dt>
                      <dd className="font-medium">
                        {HOUSING[answers.housingType]} · {answers.ownOrRent === 'own' ? 'Owned' : 'Rented'}
                        {answers.hasYard ? ' · Garden' : ''}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Baby className="text-muted-foreground size-4 shrink-0" />
                    <div>
                      <dt className="text-muted-foreground text-xs">Household</dt>
                      <dd className="font-medium">
                        {answers.householdSize} people
                        {answers.hasChildren
                          ? ` · children ${(answers.childrenAges ?? []).join(', ')}`
                          : ' · no children'}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dog className="text-muted-foreground size-4 shrink-0" />
                    <div>
                      <dt className="text-muted-foreground text-xs">Experience</dt>
                      <dd className="font-medium">{EXPERIENCE[answers.experienceLevel]}</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="text-muted-foreground size-4 shrink-0" />
                    <div>
                      <dt className="text-muted-foreground text-xs">Alone per day</dt>
                      <dd className="font-medium">{answers.hoursAlonePerDay} hours</dd>
                    </div>
                  </div>
                </dl>

                <div className="mt-4">
                  <h3 className="text-muted-foreground mb-1 text-xs">Why this pet</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {answers.reasonForAdopting}
                  </p>
                </div>

                {answers.otherPets ? (
                  <div className="mt-3">
                    <h3 className="text-muted-foreground mb-1 text-xs">Other pets</h3>
                    <p className="text-sm leading-relaxed">{answers.otherPets}</p>
                  </div>
                ) : null}

                {application.references.length > 0 ? (
                  <div className="mt-3">
                    <h3 className="text-muted-foreground mb-1 text-xs">References</h3>
                    <ul className="text-sm">
                      {application.references.map((reference, index) => (
                        <li key={index} className="text-muted-foreground">
                          <span className="text-foreground font-medium">{reference.name}</span> ·{' '}
                          {reference.relationship} · {reference.phone}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {application.reviewNote ? (
                  <div className="bg-muted/50 mt-3 rounded-lg p-3">
                    <p className="text-muted-foreground mb-0.5 text-xs">Your note</p>
                    <p className="text-sm">{application.reviewNote}</p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <ApplicationActions
                    applicationId={application.id}
                    status={application.status}
                    applicantName={application.applicantSnapshot.name}
                    petName={application.pet?.name ?? 'the pet'}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
