import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/shared/container';
import { FadeIn } from '@/components/motion/fade-in';

const impact = [
  { amount: 'Rs. 1,000', what: 'feeds a shelter dog for a month' },
  { amount: 'Rs. 2,500', what: 'covers a full course of vaccinations' },
  { amount: 'Rs. 7,500', what: 'pays for a neutering operation' },
];

export function DonationBanner() {
  return (
    <section className="py-16 sm:py-20" aria-labelledby="donate-heading">
      <Container>
        <FadeIn>
          <div className="bg-brand-gradient relative overflow-hidden rounded-3xl">
            {/* Background photo, deliberately low contrast behind the text. alt="" because the
                adjacent copy already carries the meaning — announcing it would be noise. */}
            <div className="absolute inset-0">
              <Image
                src="https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1400&q=70"
                alt=""
                fill
                sizes="100vw"
                className="object-cover opacity-20"
                loading="lazy"
              />
            </div>

            <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
              <div className="flex flex-col items-start gap-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                  <Heart className="size-3.5 fill-current" />
                  100% goes to shelters
                </span>

                <h2 id="donate-heading" className="text-3xl font-extrabold text-white sm:text-4xl">
                  Not ready to adopt? You can still help.
                </h2>

                <p className="max-w-md leading-relaxed text-white/90 text-pretty">
                  We take no cut. Every donation goes straight to the shelter you choose, funding
                  food, medical care and the staff who do the hard part.
                </p>

                <Button asChild size="lg" variant="secondary" className="group mt-2">
                  <Link href="/donate">
                    Donate now
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>

              <ul className="flex flex-col gap-3">
                {impact.map(({ amount, what }) => (
                  <li
                    key={amount}
                    className="flex items-center gap-4 rounded-2xl bg-white/15 p-4 backdrop-blur-sm"
                  >
                    <span className="shrink-0 text-2xl font-extrabold text-white">{amount}</span>
                    <span className="text-sm text-white/90">{what}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
