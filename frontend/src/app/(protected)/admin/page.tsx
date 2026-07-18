import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Clock, Inbox, PawPrint, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { adminServer, type PlatformStats } from '@/services/admin.server';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const inner = (
    <>
      <span className="bg-brand-50 text-primary-strong mb-3 grid size-10 place-items-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-sm">{label}</p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className="bg-card shadow-soft hover-lift rounded-2xl border p-5">
      {inner}
    </Link>
  ) : (
    <div className="bg-card shadow-soft rounded-2xl border p-5">{inner}</div>
  );
}

/** CSS bars — a dozen numbers do not justify shipping a charting library to the browser. */
function AdoptionChart({ data }: { data: PlatformStats['adoptionsByMonth'] }) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No completed adoptions yet.</p>;
  }

  const max = Math.max(...data.map((row) => row.count), 1);

  return (
    <ul className="flex h-40 items-end gap-2">
      {data.map((row) => (
        <li key={row.month} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">{row.count}</span>
          <div
            className="bg-brand-gradient w-full rounded-t-md"
            style={{ height: `${Math.max((row.count / max) * 100, 4)}%` }}
            role="img"
            aria-label={`${row.count} adoptions in ${row.month}`}
          />
          <span className="text-muted-foreground text-[10px]">{row.month.slice(5)}</span>
        </li>
      ))}
    </ul>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="bg-card shadow-soft rounded-2xl border p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      <dl className="flex flex-col gap-3">
        {rows.map(([label, count]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function AdminOverviewPage() {
  let stats: PlatformStats | null = null;

  try {
    stats = await adminServer.stats();
  } catch {
    return (
      <Alert variant="destructive">
        <AlertTitle>Statistics unavailable</AlertTitle>
        <AlertDescription>Could not load platform statistics. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const queue = stats.shelters.pending + stats.pets.pending;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Platform overview</h1>
        <p className="text-muted-foreground mt-1">Everything happening across PawfectHome.</p>
      </div>

      {queue > 0 ? (
        <Alert className="mb-8">
          <Clock className="size-4" />
          <AlertTitle>{queue} item{queue === 1 ? '' : 's'} awaiting review</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2 pt-2">
            {stats.shelters.pending > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/shelters?status=pending">
                  {stats.shelters.pending} shelter{stats.shelters.pending === 1 ? '' : 's'}
                </Link>
              </Button>
            ) : null}
            {stats.pets.pending > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/pets?status=pending">
                  {stats.pets.pending} listing{stats.pets.pending === 1 ? '' : 's'}
                </Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={stats.users.total.toLocaleString()}
          hint={`+${stats.users.newLast30Days} in 30 days`}
          icon={Users}
          href="/admin/users"
        />
        <StatCard
          label="Listings"
          value={stats.pets.total.toLocaleString()}
          hint={`${stats.pets.available} available`}
          icon={PawPrint}
          href="/admin/pets"
        />
        <StatCard
          label="Shelters"
          value={stats.shelters.total}
          hint={`${stats.shelters.approved} approved`}
          icon={Building2}
          href="/admin/shelters"
        />
        <StatCard
          label="Applications"
          value={stats.applications.total.toLocaleString()}
          hint={`${stats.applications.completed} completed`}
          icon={Inbox}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Breakdown
          title="Users by role"
          rows={[
            ['Adopters', stats.users.adopters],
            ['Shelters', stats.users.shelters],
            ['Admins', stats.users.admins],
          ]}
        />
        <Breakdown
          title="Listings by status"
          rows={[
            ['Available', stats.pets.available],
            ['Pending approval', stats.pets.pending],
            ['Reserved', stats.pets.reserved],
            ['Adopted', stats.pets.adopted],
            ['Archived', stats.pets.archived],
          ]}
        />
        <Breakdown
          title="Applications"
          rows={[
            ['Awaiting review', stats.applications.pending],
            ['Under review', stats.applications.underReview],
            ['Approved', stats.applications.approved],
            ['Completed', stats.applications.completed],
            ['Not successful', stats.applications.rejected],
          ]}
        />
      </div>

      <section aria-labelledby="chart-heading" className="bg-card shadow-soft rounded-2xl border p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="text-primary-strong size-5" />
          <h2 id="chart-heading" className="font-semibold">
            Completed adoptions by month
          </h2>
        </div>
        <AdoptionChart data={stats.adoptionsByMonth} />
      </section>
    </div>
  );
}
