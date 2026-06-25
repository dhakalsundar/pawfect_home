import { Container } from '@/components/shared/container';
import { ShelterNav } from '@/features/shelter/components/shelter-nav';
import { requireRole } from '@/services/session';

/**
 * Role guard for the shelter dashboard. `requireRole` redirects to /403 for anyone else — but the
 * real boundary is the API, which re-checks ownership on every request regardless of what the
 * frontend rendered.
 */
export default async function ShelterLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['shelter', 'admin'], '/shelter');

  return (
    <Container className="py-8 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <aside>
          <div className="lg:sticky lg:top-24">
            <ShelterNav user={user} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
