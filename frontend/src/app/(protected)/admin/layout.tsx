import { Container } from '@/components/shared/container';
import { AdminNav } from '@/features/admin/components/admin-nav';
import { requireRole } from '@/services/session';

/**
 * Admin-only shell. `requireRole` redirects everyone else to /403 — but as everywhere, the API
 * re-checks the role on every request, so this is correctness rather than the security boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['admin'], '/admin');

  return (
    <Container className="py-8 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <aside>
          <div className="lg:sticky lg:top-24">
            <AdminNav user={user} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
