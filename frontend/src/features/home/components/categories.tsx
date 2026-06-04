import Link from 'next/link';
import { Section, SectionHeader } from '@/components/shared/section';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { petCategories } from '@/config/nav';
import { petsServer } from '@/services/pets.server';

/**
 * Counts come from the live facet aggregation, so the tiles never promise more animals than the
 * listing can actually show. If the API is unreachable the tiles still render, just without counts.
 */
export async function Categories() {
  let counts: Record<string, number> = {};

  try {
    const facets = await petsServer.facetsServer({});
    counts = Object.fromEntries(facets.species.map((bucket) => [bucket.value, bucket.count]));
  } catch {
    counts = {};
  }

  return (
    <Section size="sm" aria-labelledby="categories-heading">
      <SectionHeader
        eyebrow="Browse by species"
        title={<span id="categories-heading">Who are you looking for?</span>}
        description="Every listing comes from a shelter we have verified."
      />

      <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {petCategories.map(({ label, value, icon: Icon }) => {
          const count = counts[value];
          return (
            <StaggerItem key={value}>
              <Link
                href={`/pets?species=${value}`}
                className="hover-lift bg-card group flex flex-col items-center gap-3 rounded-2xl border p-6 text-center"
              >
                <span className="bg-brand-50 text-primary-strong grid size-14 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110">
                  <Icon className="size-7" />
                </span>
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground text-xs">
                  {count === undefined ? 'Browse' : `${count.toLocaleString()} available`}
                </span>
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>
    </Section>
  );
}
