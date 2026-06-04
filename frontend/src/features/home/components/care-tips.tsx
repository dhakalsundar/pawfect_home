import Image from 'next/image';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Section, SectionHeader } from '@/components/shared/section';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { careTips } from '../data';

export function CareTips() {
  return (
    <Section aria-labelledby="tips-heading">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <SectionHeader
          align="left"
          eyebrow="Pet care tips"
          title={<span id="tips-heading">Advice from people who do this daily</span>}
          description="Written with shelter staff and veterinary nurses."
          className="mb-0"
        />
        {/* The blog is not built — see the open question in docs/PROGRESS.md. A CTA pointing at
            a 404 is worse than no CTA, and Next prefetches it, so it logged console errors too. */}
      </div>

      <Stagger className="grid gap-6 md:grid-cols-3">
        {careTips.map((tip) => (
          <StaggerItem key={tip.id}>
            <article className="group bg-card hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={tip.image}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{tip.category}</Badge>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Clock className="size-3" />
                    {tip.readingTime}
                  </span>
                </div>

                <h3 className="leading-snug font-semibold text-balance">
                  {tip.title}
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {tip.excerpt}
                </p>
              </div>
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
