import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, PawPrint } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/shared/container';
import { EmptyState } from '@/components/shared/empty-state';
import { adoptionsServer } from '@/services/adoptions.server';
import { STATUS_META } from '@/types/adoption';

export const metadata: Metadata = {
  title: 'My applications',
  robots: { index: false, follow: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ApplicationsPage() {
  const { items, meta } = await adoptionsServer.list();

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">My applications</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total === 0
            ? 'You have not applied for any pets yet.'
            : `${meta.total} application${meta.total === 1 ? '' : 's'}`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title="No applications yet"
          description="When you apply to adopt, you can track the shelter's response here."
          action={
            <Button asChild className="bg-brand-gradient border-0 text-white">
              <Link href="/pets">Browse pets</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((application) => {
            const meta = STATUS_META[application.status];
            return (
              <li key={application.id}>
                <Link
                  href={`/dashboard/applications/${application.id}`}
                  className="bg-card hover-lift flex items-center gap-4 rounded-2xl border p-4 transition-colors"
                >
                  {application.pet?.image ? (
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
                      <Image
                        src={application.pet.image}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="bg-muted grid size-16 shrink-0 place-items-center rounded-xl">
                      <PawPrint className="text-muted-foreground size-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">
                        {application.pet?.name ?? 'Pet no longer listed'}
                      </h2>
                      <Badge className={meta.tone}>{meta.label}</Badge>
                    </div>
                    <p className="text-muted-foreground truncate text-sm">
                      {application.pet?.breed}
                      {application.shelter ? ` · ${application.shelter.name}` : ''}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Applied {formatDate(application.createdAt)}
                    </p>
                  </div>

                  <ChevronRight className="text-muted-foreground size-5 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
