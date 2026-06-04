import { ClipboardList, HeartHandshake, Home, Search } from 'lucide-react';
import { Section, SectionHeader } from '@/components/shared/section';
import { FadeIn } from '@/components/motion/fade-in';

const steps = [
  {
    icon: Search,
    title: 'Search',
    body: 'Filter by species, size, age, temperament and distance. Save the ones you like.',
  },
  {
    icon: ClipboardList,
    title: 'Apply',
    body: 'One form, about ten minutes. The shelter sees it immediately and can message you back.',
  },
  {
    icon: HeartHandshake,
    title: 'Meet',
    body: 'Arrange a visit. Most shelters encourage a second meeting before anything is decided.',
  },
  {
    icon: Home,
    title: 'Bring them home',
    body: 'Sign the paperwork, pay the shelter directly, and start the best part.',
  },
];

export function HowItWorks() {
  return (
    <Section aria-labelledby="how-heading">
      <SectionHeader
        eyebrow="How it works"
        title={<span id="how-heading">Four steps to a new companion</span>}
        description="No hidden fees, and no obligation until you have met in person."
      />

      <FadeIn>
        <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Connector line, desktop only. Purely decorative, so it is hidden from assistive tech
              and sits behind the numbered markers. */}
          <div
            className="via-border absolute top-7 right-0 left-0 hidden h-px bg-gradient-to-r from-transparent to-transparent lg:block"
            aria-hidden="true"
          />

          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="relative flex flex-col items-center gap-3 text-center">
              <span className="bg-card ring-background relative grid size-14 place-items-center rounded-2xl border ring-8">
                <Icon className="text-primary-strong size-6" />
                <span className="bg-brand-gradient absolute -top-2 -right-2 grid size-6 place-items-center rounded-full text-xs font-bold text-white">
                  {index + 1}
                </span>
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-muted-foreground max-w-[26ch] text-sm leading-relaxed text-pretty">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </FadeIn>
    </Section>
  );
}
