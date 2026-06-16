import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { requireSession } from '@/services/session';

/**
 * Server-side session guard for every protected route.
 *
 * middleware.ts already redirected anyone without a cookie, but it cannot verify a signature — it
 * has no access to the secret. This layout asks the API who the user actually is, which is the
 * answer that counts on the frontend. The API still re-authorises each individual request.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
