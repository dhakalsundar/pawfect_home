import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, Eye, Heart, Inbox, PawPrint, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { shelterServer, type ShelterAnalytics } from '@/services/shelter.server';

export const metadata: Metadata = {
  title: 'Shelter dashboard',
  robots: { index: false, follow: false },
};

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card shadow-soft rounded-2xl border p-5">
      <span className="bg-brand-50 text-primary-strong mb-3 grid size-10 place-items-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-sm">{label}</p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

/** Simple CSS bar chart — Recharts would be a client bundle for what is a list of numbers. */
function MonthlyChart({ data }: { data: ShelterAnalytics['applicationsByMonth'] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No applications yet.</p>;
  }

  const max = Math.max(...data.map((row) => row.count), 1);

  return (
    <ul className="flex h-40 items-end gap-2">
      {data.map((row) => (
        <li key={row.month} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">{row.count}</span>
          <div
            className="bg-brand-gradient w-full rounded-t-md"
            // Percentage height keeps the bars proportional at any container size.
            style={{ height: `${Math.max((row.count / max) * 100, 4)}%` }}
            role="img"
            aria-label={`${row.count} applications in ${row.month}`}
          />
          <span className="text-muted-foreground text-[10px]">{row.month.slice(5)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ShelterOverviewPage() {
  let analytics: ShelterAnalytics | null = null;
  let error: string | null = null;

  try {
    analytics = await shelterServer.analytics();
  } catch {
    error = 'Could not load your analytics. Please try again shortly.';
  }

  if (!analytics) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Analytics unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const needsAttention = analytics.applications.pending + analytics.applications.underReview;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Overview</h1>
          <p className="text-muted-foreground mt-1">How your listings are doing.</p>
        </div>
        {needsAttention > 0 ? (
          <Button asChild className="bg-brand-gradient gap-1.5 border-0 text-white">
            <Link href="/shelter/applications">
              <Inbox className="size-4" />
              {needsAttention} to review
            </Link>
          </Button>
        ) : null}
      </div>

      {analytics.pets.pending > 0 ? (
        <Alert className="mb-8">
          <Clock className="size-4" />
          <AlertTitle>
            {analytics.pets.pending} listing{analytics.pets.pending === 1 ? '' : 's'} awaiting approval
          </AlertTitle>
          <AlertDescription>
            New listings are reviewed by an administrator before they appear publicly. This usually
            takes a day or two.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listings" value={analytics.pets.total} hint={`${analytics.pets.available} available`} icon={PawPrint} />
        <Stat label="Applications" value={analytics.applications.total} hint={`${needsAttention} need review`} icon={Inbox} />
        <Stat label="Profile views" value={analytics.engagement.views.toLocaleString()} icon={Eye} />
        <Stat
          label="Conversion"
          value={`${analytics.engagement.conversionRate}%`}
          hint="Applications per 100 views"
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pipeline-heading" className="bg-card shadow-soft rounded-2xl border p-5">
          <h2 id="pipeline-heading" className="mb-4 font-semibold">
            Application pipeline
          </h2>
          <dl className="flex flex-col gap-3">
            {[
              ['Awaiting review', analytics.applications.pending],
              ['Under review', analytics.applications.underReview],
              ['Approved', analytics.applications.approved],
              ['Completed', analytics.applications.completed],
              ['Not successful', analytics.applications.rejected],
            ].map(([label, count]) => (
              <div key={String(label)} className="flex items-center justify-between text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>

          {analytics.averageDaysToAdopt !== null ? (
            <>
              <div className="my-4 border-t" />
              <p className="text-muted-foreground text-sm">
                Average time to adoption:{' '}
                <span className="text-foreground font-semibold">
                  {analytics.averageDaysToAdopt} days
                </span>
              </p>
            </>
          ) : null}
        </section>

        <section aria-labelledby="chart-heading" className="bg-card shadow-soft rounded-2xl border p-5">
          <h2 id="chart-heading" className="mb-4 font-semibold">
            Applications by month
          </h2>
          <MonthlyChart data={analytics.applicationsByMonth} />
        </section>
      </div>

      {analytics.topPets.length > 0 ? (
        <section aria-labelledby="top-heading" className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="top-heading" className="text-xl font-bold">
              Most viewed
            </h2>
            <Button asChild variant="ghost" size="sm" className="group gap-1.5">
              <Link href="/shelter/pets">
                All pets
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {analytics.topPets.map((pet) => (
              <li key={pet.id}>
                <Link
                  href={`/pets/${pet.slug}`}
                  className="bg-card hover-lift flex items-center justify-between gap-4 rounded-xl border p-3"
                >
                  <span className="truncate font-medium">{pet.name}</span>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-4 text-sm tabular-nums">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3.5" />
                      {pet.views}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="size-3.5" />
                      {pet.applications}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
