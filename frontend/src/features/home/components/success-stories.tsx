import Image from 'next/image';
import { Quote } from 'lucide-react';
import { Section, SectionHeader } from '@/components/shared/section';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { successStories } from '../data';

export function SuccessStories() {
  return (
    <Section aria-labelledby="stories-heading">
      <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <SectionHeader
          align="left"
          eyebrow="Success stories"
          title={<span id="stories-heading">They found their people</span>}
          description="Recent adoptions, in the words of the families who made them."
          className="mb-0"
        />
        {/* The blog is not built — see the open question in docs/PROGRESS.md. A CTA pointing at
            a 404 is worse than no CTA, and Next prefetches it, so it logged console errors too. */}
      </div>

      <Stagger className="grid gap-6 md:grid-cols-3">
        {successStories.map((story) => (
          <StaggerItem key={story.id}>
            <figure className="bg-card hover-lift flex h-full flex-col overflow-hidden rounded-2xl border">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={story.image}
                  alt={`${story.petName}, adopted by ${story.adopterName}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                  loading="lazy"
                />
                <span className="glass absolute top-3 left-3 rounded-full border px-2.5 py-1 text-xs font-medium">
                  {story.adoptedAgo}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-5">
                <Quote className="text-primary-strong/25 size-7 shrink-0" aria-hidden="true" />
                <blockquote className="text-sm leading-relaxed text-pretty">
                  {story.quote}
                </blockquote>
                <figcaption className="mt-auto border-t pt-3">
                  <p className="text-sm font-semibold">
                    {story.petName} &amp; {story.adopterName}
                  </p>
                  <p className="text-muted-foreground text-xs">{story.location}</p>
                </figcaption>
              </div>
            </figure>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
