import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { Section } from '@/components/shared/section';

// Root not-found sits outside the (marketing) group, so it brings its own chrome.
export default function NotFound() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Section size="lg" glow>
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-brand-gradient text-7xl font-extrabold sm:text-8xl">404</p>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold sm:text-3xl">This page has wandered off</h1>
              <p className="text-muted-foreground mx-auto max-w-md text-pretty">
                The page you are looking for doesn&apos;t exist or has moved. Plenty of pets are
                still waiting to meet you.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="bg-brand-gradient border-0 text-white">
                <Link href="/pets">
                  <Search />
                  Browse pets
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">
                  <ArrowLeft />
                  Back home
                </Link>
              </Button>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
