import { Container } from '@/components/shared/container';
import { DashboardNav } from '@/features/dashboard/components/dashboard-nav';
import { requireSession } from '@/services/session';

/**
 * Dashboard shell. The session is already guaranteed by the (protected) layout above; it is read
 * again here for the sidebar's user card. React's per-request cache makes that one API call.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();

  return (
    <Container className="py-8 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <aside>
          <div className="lg:sticky lg:top-24">
            <DashboardNav user={user} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
