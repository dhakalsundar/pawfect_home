import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/shared/container';

/**
 * Server Component — no interactivity, so it ships no JavaScript.
 *
 * Entrance animation uses the CSS `.reveal` utility rather than motion/react: this is
 * above-the-fold content and must be visible before hydration. See globals.css.
 */
export function Hero() {
  return (
    <section className="bg-brand-glow relative overflow-hidden pt-8 pb-16 sm:pt-12 sm:pb-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <span className="reveal border-primary/20 bg-primary/5 text-primary-strong inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium">
              <Heart className="size-3.5 fill-current" />
              Over 12,000 pets rehomed
            </span>

            <h1
              className="reveal text-4xl leading-[1.1] font-extrabold sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '70ms' }}
            >
              Every pet deserves
              <br />
              <span className="text-brand-gradient">a family like yours</span>
            </h1>

            <p
              className="reveal text-muted-foreground max-w-lg text-lg leading-relaxed text-pretty"
              style={{ animationDelay: '140ms' }}
            >
              Browse adoptable dogs, cats, birds and rabbits from verified shelters near you. Apply
              in minutes, message shelters directly, and bring someone home.
            </p>

            <div
              className="reveal flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '210ms' }}
            >
              <Button
                asChild
                size="lg"
                className="bg-brand-gradient hover:shadow-glow group border-0 text-white transition-shadow"
              >
                <Link href="/pets">
                  <Search />
                  Find your match
                  <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/shelters">
                  <MapPin />
                  Shelters near me
                </Link>
              </Button>
            </div>

            <div
              className="reveal text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
              style={{ animationDelay: '280ms' }}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="text-success size-4" />
                Verified shelters only
              </span>
              <span className="flex items-center gap-1.5">
                <Heart className="text-primary-strong size-4" />
                No adoption fees to us
              </span>
            </div>
          </div>

          {/*
            Image collage. Fixed aspect ratios so nothing reflows as images decode — the layout is
            reserved before a single byte arrives, which is what keeps CLS at zero.

            Deliberately NOT wrapped in `.reveal`. This block holds the LCP candidate, and an
            element at opacity:0 does not count as painted — fading it in with a 160ms delay pushed
            Largest Contentful Paint out by roughly the length of the animation, for a flourish
            nobody notices. The text column still animates; the images paint immediately.
          */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-4 pt-8">
                <div className="shadow-lift relative aspect-[3/4] overflow-hidden rounded-3xl">
                  <Image
                    src="https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=75"
                    alt="A golden retriever sitting in the grass, looking at the camera"
                    fill
                    sizes="(max-width: 1024px) 45vw, 280px"
                    className="object-cover"
                    // The largest element in the viewport on load — priority makes it the LCP
                    // candidate Next preloads rather than lazy-loading.
                    priority
                  />
                </div>
                <div className="shadow-lift relative aspect-square overflow-hidden rounded-3xl">
                  <Image
                    src="https://images.unsplash.com/photo-1596492784531-6e6eb5ea9993?auto=format&fit=crop&w=500&q=75"
                    alt="A rabbit sitting in a garden"
                    fill
                    sizes="(max-width: 1024px) 45vw, 280px"
                    className="object-cover"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="shadow-lift relative aspect-square overflow-hidden rounded-3xl">
                  <Image
                    src="https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=75"
                    alt="A tabby cat resting"
                    fill
                    sizes="(max-width: 1024px) 45vw, 280px"
                    className="object-cover"
                    priority
                  />
                </div>
                <div className="shadow-lift relative aspect-[3/4] overflow-hidden rounded-3xl">
                  <Image
                    src="https://images.unsplash.com/photo-1601979031925-424e53b6caaa?auto=format&fit=crop&w=600&q=75"
                    alt="A beagle standing outdoors"
                    fill
                    sizes="(max-width: 1024px) 45vw, 280px"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Floating stat card. aria-hidden decorative paw, real text for screen readers. */}
            <div className="glass shadow-float absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3">
              <span className="bg-brand-gradient grid size-9 place-items-center rounded-xl">
                <Heart className="size-4 fill-white text-white" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-bold">340+ shelters</p>
                <p className="text-muted-foreground text-xs">across 42 states</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
