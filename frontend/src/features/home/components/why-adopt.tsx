import Image from 'next/image';
import { HandHeart, HeartPulse, Home, Sparkles } from 'lucide-react';
import { Section, SectionHeader } from '@/components/shared/section';
import { FadeIn } from '@/components/motion/fade-in';

const reasons = [
  {
    icon: Home,
    title: 'You free up a space',
    body: 'Every adoption opens a kennel for the next animal in need. One adoption quietly helps two.',
  },
  {
    icon: HeartPulse,
    title: 'They arrive ready',
    body: 'Shelter pets are typically vaccinated, health-checked and neutered before they go home.',
  },
  {
    icon: Sparkles,
    title: 'You know who they are',
    body: 'Staff have lived with them for weeks. You get an honest account of temperament, not a guess.',
  },
  {
    icon: HandHeart,
    title: 'It costs far less',
    body: 'Adoption fees are a fraction of breeder prices, and they fund care for the animals still waiting.',
  },
];

export function WhyAdopt() {
  return (
    <Section glow aria-labelledby="why-adopt-heading">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <FadeIn direction="right">
          <div className="relative">
            <div className="shadow-float relative aspect-[4/3] overflow-hidden rounded-3xl">
              <Image
                src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=75"
                alt="Two dogs walking together along a trail"
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
                loading="lazy"
              />
            </div>

            <div className="glass shadow-float absolute -right-3 -bottom-6 max-w-[190px] rounded-2xl border p-4 sm:-right-6">
              <p className="text-brand-gradient text-3xl font-extrabold">3.1M</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                animals enter shelters in the US each year
              </p>
            </div>
          </div>
        </FadeIn>

        <div>
          <SectionHeader
            align="left"
            eyebrow="Why adopt?"
            title={<span id="why-adopt-heading">A rescue is not second best</span>}
            description="Shelter animals are not damaged goods. Most are there because of a house move, an allergy, or a family whose circumstances changed."
          />

          {/* The reveal wraps the whole list, not each item: a <ul> may only contain <li>, and
              slipping a motion <div> around each one would break list semantics for screen
              readers ("list of 4 items" becomes four separate lists). */}
          <FadeIn>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {reasons.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex flex-col gap-2">
                  <span className="bg-brand-50 text-primary-strong grid size-11 place-items-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </FadeIn>
        </div>
      </div>
    </Section>
  );
}
