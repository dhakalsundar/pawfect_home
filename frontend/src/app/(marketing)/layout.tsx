import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/**
 * Public shell. The (auth) route group gets its own centred-card layout with no navbar,
 * and (protected) gets the dashboard shell — which is why this is a route group rather
 * than markup in the root layout.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
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
