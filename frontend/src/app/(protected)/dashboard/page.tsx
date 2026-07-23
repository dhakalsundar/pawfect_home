import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BadgeCheck, Heart, MailWarning, PawPrint, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared/empty-state';
import { requireSession } from '@/services/session';
import { serverHttp } from '@/services/server-http';
import { adoptionsServer } from '@/services/adoptions.server';
import { STATUS_META } from '@/types/adoption';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

interface UserStats {
  favorites: number;
  applications: number;
  activeApplications: number;
  adoptions: number;
}

export default async function DashboardPage() {
  const user = await requireSession();

  // Neither tile is worth failing the page over, so both degrade to a safe default.
  const [stats, recent] = await Promise.all([
    serverHttp
      .get<UserStats>('/users/me/stats')
      .then((r) => r.data)
      .catch(() => ({ favorites: 0, applications: 0, activeApplications: 0, adoptions: 0 })),
    adoptionsServer
      .list({ page: 1 })
      .then((r) => r.items.slice(0, 3))
      .catch(() => []),
  ]);

  const tiles = [
    { label: 'Saved pets', value: stats.favorites, icon: Heart, href: '/dashboard/favorites' },
    { label: 'Applications', value: stats.applications, icon: PawPrint, href: '/dashboard/applications' },
    { label: 'Adopted', value: stats.adoptions, icon: BadgeCheck, href: '/dashboard/applications' },
  ];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 capitalize">
            <ShieldCheck className="size-3.5" />
            {user.role}
          </Badge>
          {user.emailVerified ? (
            <Badge className="bg-success/10 text-success gap-1.5 border-0">
              <BadgeCheck className="size-3.5" />
              Verified
            </Badge>
          ) : null}
        </div>
      </div>

      {!user.emailVerified ? (
        <Alert className="mb-8">
          <MailWarning className="size-4" />
          <AlertTitle>Confirm your email address</AlertTitle>
          <AlertDescription>
            We sent a confirmation link to {user.email}. Some features stay locked until it&apos;s
            verified.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-card shadow-soft hover-lift rounded-2xl border p-5"
          >
            <span className="bg-brand-50 text-primary-strong mb-3 grid size-10 place-items-center rounded-xl">
              <Icon className="size-5" />
            </span>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-muted-foreground text-sm">{label}</p>
          </Link>
        ))}
      </div>

      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-heading" className="text-xl font-bold">
            Recent applications
          </h2>
          {recent.length > 0 ? (
            <Button asChild variant="ghost" size="sm" className="group gap-1.5">
              <Link href="/dashboard/applications">
                View all
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={PawPrint}
            title="No applications yet"
            description="When you apply to adopt, you can track the shelter's response here."
            action={
              <Button asChild className="bg-brand-gradient border-0 text-white">
                <Link href="/pets">Find a pet</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {recent.map((application) => {
              const meta = STATUS_META[application.status];
              return (
                <li key={application.id}>
                  <Link
                    href={`/dashboard/applications/${application.id}`}
                    className="bg-card hover-lift flex items-center gap-4 rounded-2xl border p-4"
                  >
                    {application.pet?.image ? (
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                        <Image
                          src={application.pet.image}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{application.pet?.name}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {application.shelter?.name}
                      </p>
                    </div>
                    <Badge className={meta.tone}>{meta.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
