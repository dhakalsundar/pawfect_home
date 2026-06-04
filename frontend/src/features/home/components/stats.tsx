import { Container } from '@/components/shared/container';
import { FadeIn } from '@/components/motion/fade-in';
import { platformStats } from '../data';

function format(value: number): string {
  // 2.1 must stay "2.1", not become "2" — toLocaleString on an integer would drop the decimal.
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(value);
}

export function Stats() {
  return (
    <section className="bg-brand-gradient py-14 sm:py-16" aria-labelledby="stats-heading">
      <Container>
        <h2 id="stats-heading" className="sr-only">
          PawfectHome by the numbers
        </h2>

        <FadeIn>
          <dl className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {platformStats.map((stat) => (
              /*
               * A <div> grouping inside a <dl> may contain ONLY <dt> and <dd> — a stray <p> makes
               * the list invalid and breaks how screen readers pair terms with definitions.
               * So the description lives inside the <dt> as a block span, and flex-col-reverse
               * puts the number on top visually while keeping <dt> before <dd> in the DOM.
               */
              <div key={stat.label} className="flex flex-col-reverse gap-1">
                <dt className="text-sm font-semibold text-white/95">
                  {stat.label}
                  <span className="mt-0.5 block text-xs font-normal text-white/80">
                    {stat.description}
                  </span>
                </dt>
                <dd className="text-3xl font-extrabold text-white sm:text-4xl">
                  {'prefix' in stat ? stat.prefix : ''}
                  {format(stat.value)}
                  {stat.suffix}
                </dd>
              </div>
            ))}
          </dl>
        </FadeIn>
      </Container>
    </section>
  );
}
