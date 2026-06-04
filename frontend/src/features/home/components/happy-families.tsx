import Image from 'next/image';
import { Section, SectionHeader } from '@/components/shared/section';
import { FadeIn } from '@/components/motion/fade-in';
import { happyFamilies } from '../data';

/**
 * Photo wall. A masonry-ish layout via row spans rather than CSS columns, so the reading order
 * matches the visual order — CSS columns flow top-to-bottom per column, which is confusing when
 * tabbing or reading with a screen reader.
 */
export function HappyFamilies() {
  return (
    <Section size="sm" aria-labelledby="families-heading">
      <SectionHeader
        eyebrow="Happy families"
        title={<span id="families-heading">Life after adoption</span>}
        description="Photos sent in by adopters. Tag us and yours could appear here."
      />

      <FadeIn>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
          {happyFamilies.map((photo, index) => (
            <li
              key={photo.image}
              className={
                // Every third tile is taller, which breaks up an otherwise rigid grid.
                index % 3 === 0
                  ? 'relative aspect-square overflow-hidden rounded-2xl sm:aspect-[3/4]'
                  : 'relative aspect-square overflow-hidden rounded-2xl'
              }
            >
              <Image
                src={photo.image}
                alt={photo.alt}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      </FadeIn>
    </Section>
  );
}
