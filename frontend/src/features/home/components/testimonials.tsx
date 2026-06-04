import Image from 'next/image';
import { Star } from 'lucide-react';
import { Section, SectionHeader } from '@/components/shared/section';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { testimonials } from '../data';
import { cn } from '@/lib/utils';

function Rating({ value }: { value: number }) {
  return (
    // The stars are decorative duplication of the text label, so they are hidden from
    // assistive tech and the rating is announced once, in words.
    <div className="flex items-center gap-0.5">
      <span className="sr-only">{value} out of 5 stars</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn(
            'size-4',
            star <= value ? 'fill-amber-brand text-amber-brand' : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <Section glow aria-labelledby="testimonials-heading">
      <SectionHeader
        eyebrow="Testimonials"
        title={<span id="testimonials-heading">What adopters and shelters say</span>}
        description="Feedback from both sides of the adoption."
      />

      <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {testimonials.map((item) => (
          <StaggerItem key={item.id}>
            <figure className="bg-card shadow-soft flex h-full flex-col gap-4 rounded-2xl border p-5">
              <Rating value={item.rating} />

              <blockquote className="flex-1 text-sm leading-relaxed text-pretty">
                {item.quote}
              </blockquote>

              <figcaption className="flex items-center gap-3 border-t pt-4">
                <Image
                  src={item.avatar}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 rounded-full object-cover"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{item.role}</p>
                </div>
              </figcaption>
            </figure>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}
