import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Mail, MapPin, Phone, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ShelterActions } from '@/features/admin/components/shelter-actions';
import { adminServer } from '@/services/admin.server';

export const metadata: Metadata = {
  title: 'Shelters',
  robots: { index: false, follow: false },
};

const STATUS_TONE: Record<string, string> = {
  approved: 'bg-success/10 text-success border-0',
  pending: 'bg-warning/15 text-warning border-0',
  rejected: 'bg-destructive/10 text-destructive border-0',
  suspended: 'bg-muted text-muted-foreground border-0',
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Awaiting review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

export default async function AdminSheltersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { items, meta } = await adminServer.shelters({ status });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Shelters</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total} shelter{meta.total === 1 ? '' : 's'}
          {status ? ` · ${status}` : ''}
        </p>
      </div>

      <nav aria-label="Filter shelters" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (status ?? '') === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/admin/shelters?status=${filter.value}` : '/admin/shelters'}
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
          icon={Building2}
          title={status ? `No ${status} shelters` : 'No shelters yet'}
          description="Shelter registrations appear here for review."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((shelter) => (
            <li key={shelter.id} className="bg-card shadow-soft rounded-2xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{shelter.name}</h2>
                    <Badge className={STATUS_TONE[shelter.status]}>{shelter.status}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {shelter.city}, {shelter.state}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="size-3" />
                      {shelter.email}
                    </span>
                    {shelter.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {shelter.phone}
                      </span>
                    ) : null}
                    {shelter.rating.count > 0 ? (
                      <span className="flex items-center gap-1">
                        <Star className="fill-amber-brand text-amber-brand size-3" />
                        {shelter.rating.average.toFixed(1)} ({shelter.rating.count})
                      </span>
                    ) : null}
                  </p>
                  {shelter.owner?.email ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Owner: {shelter.owner.name} · {shelter.owner.email}
                    </p>
                  ) : null}
                  {shelter.registrationNumber ? (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Registration: <span className="font-mono">{shelter.registrationNumber}</span>
                    </p>
                  ) : null}
                </div>

                <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                  <p>{shelter.stats.totalPets} listings</p>
                  <p>{shelter.stats.adoptedPets} rehomed</p>
                </div>
              </div>

              <p className="text-muted-foreground mt-3 line-clamp-2 text-sm leading-relaxed">
                {shelter.description}
              </p>

              {shelter.rejectionReason ? (
                <div className="bg-muted/50 mt-3 rounded-lg p-3">
                  <p className="text-muted-foreground mb-0.5 text-xs">Reason on file</p>
                  <p className="text-sm">{shelter.rejectionReason}</p>
                </div>
              ) : null}

              <ShelterActions shelterId={shelter.id} name={shelter.name} status={shelter.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
