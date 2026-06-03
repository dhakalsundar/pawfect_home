import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Logo } from '@/components/shared/logo';
import { Separator } from '@/components/ui/separator';
import { footerNav } from '@/config/nav';
import { siteConfig } from '@/config/site';

/**
 * Lucide removed brand logos (trademark reasons), so the social marks are inlined here rather than
 * adding a second icon package for four glyphs. They inherit currentColor like any Lucide icon.
 */
const socialPaths: Record<string, string> = {
  X: 'M18.9 2H22l-6.9 7.9L23 22h-6.4l-5-6.6L5.8 22H2.7l7.4-8.5L2 2h6.6l4.5 6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z',
  Instagram:
    'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.2.4-.3 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.2-.3-.4-.7-.6-1.2-.8-.4-.2-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm6.2-8.3a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Z',
  Facebook:
    'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z',
  GitHub:
    'M12 2C6.5 2 2 6.6 2 12.3c0 4.5 2.9 8.3 6.8 9.7.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.2-4.6-5.1 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9 9 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.8-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10.3 10.3 0 0 0 22 12.3C22 6.6 17.5 2 12 2Z',
};

function SocialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={socialPaths[name]} />
    </svg>
  );
}

const socials = [
  { href: siteConfig.links.twitter, label: 'X' },
  { href: siteConfig.links.instagram, label: 'Instagram' },
  { href: siteConfig.links.facebook, label: 'Facebook' },
  { href: siteConfig.links.github, label: 'GitHub' },
];

/**
 * Server Component — it is pure content with no interactivity, so it ships zero JavaScript.
 * The newsletter form arrives in Batch 3 as a client island slotted into this shell.
 */
export function Footer() {
  return (
    <footer className="bg-muted/40 mt-auto border-t">
      <Container>
        <div className="grid gap-10 py-14 lg:grid-cols-[1.4fr_2.6fr]">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="text-muted-foreground max-w-xs text-sm leading-relaxed text-pretty">
              {siteConfig.description}
            </p>

            <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{siteConfig.address}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                <a href={`mailto:${siteConfig.email}`} className="hover:text-foreground transition-colors">
                  {siteConfig.email}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                <a
                  href={`tel:${siteConfig.phone.replace(/[^+\d]/g, '')}`}
                  className="hover:text-foreground transition-colors"
                >
                  {siteConfig.phone}
                </a>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerNav.map((group) => (
              <nav key={group.title} aria-labelledby={`footer-${group.title}`}>
                <h3 id={`footer-${group.title}`} className="mb-3 text-sm font-semibold">
                  {group.title}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.href}`}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} {siteConfig.name}. Built with care for animals in need.
          </p>
          <ul className="flex items-center gap-1">
            {socials.map(({ href, label }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-9 place-items-center rounded-lg transition-colors"
                >
                  <SocialIcon name={label} className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  );
}
