import { Container } from '@/components/shared/container';
import { trustedOrganisations } from '../data';

/**
 * Partner strip. Real logos would be images; until partners exist these are wordmarks, which is
 * honest — inventing logos for organisations that have not signed up would be fabrication.
 */
export function TrustedOrgs() {
  return (
    <section className="border-y py-10" aria-labelledby="trusted-heading">
      <Container>
        <h2
          id="trusted-heading"
          className="text-muted-foreground mb-6 text-center text-xs font-semibold tracking-widest uppercase"
        >
          Trusted by shelters and rescues nationwide
        </h2>

        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {trustedOrganisations.map((name) => (
            <li
              key={name}
              // Full muted-foreground, not /70: the extra transparency measured 4.26:1 against the
              // dark background, under the 4.5:1 minimum for body text.
              className="text-muted-foreground hover:text-foreground text-sm font-semibold tracking-tight transition-colors sm:text-base"
            >
              {name}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
