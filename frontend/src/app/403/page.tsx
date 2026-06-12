import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Section } from '@/components/shared/section';

export const metadata: Metadata = {
  title: 'Access denied',
  robots: { index: false, follow: false },
};

export default function ForbiddenPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Section size="lg">
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="bg-destructive/10 text-destructive grid size-16 place-items-center rounded-2xl">
              <ShieldOff className="size-8" />
            </span>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold sm:text-3xl">Access denied</h1>
              <p className="text-muted-foreground mx-auto max-w-md text-pretty">
                Your account doesn&apos;t have permission to view this page. If you think that&apos;s
                a mistake, contact us and we&apos;ll take a look.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="bg-brand-gradient border-0 text-white">
                <Link href="/dashboard">
                  <ArrowLeft />
                  Back to dashboard
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/contact">Contact support</Link>
              </Button>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
