import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Hero } from '@/features/home/components/hero';
import { TrustedOrgs } from '@/features/home/components/trusted-orgs';
import {
  FeaturedPets,
  FeaturedPetsSkeleton,
} from '@/features/home/components/featured-pets';
import { Categories } from '@/features/home/components/categories';
import { WhyAdopt } from '@/features/home/components/why-adopt';
import { Stats } from '@/features/home/components/stats';
import { HowItWorks } from '@/features/home/components/how-it-works';
import { SuccessStories } from '@/features/home/components/success-stories';
import { HappyFamilies } from '@/features/home/components/happy-families';
import { Testimonials } from '@/features/home/components/testimonials';
import { DonationBanner } from '@/features/home/components/donation-banner';
import { CareTips } from '@/features/home/components/care-tips';
import { Newsletter } from '@/features/home/components/newsletter';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  // The root layout's title template appends the site name; this page owns the whole title.
  title: {
    absolute: `${siteConfig.name} — Adopt a pet from a verified shelter near you`,
  },
  description: siteConfig.description,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: '/',
    type: 'website',
  },
};

/**
 * Structured data so search results can show the site search box and organisation details.
 * Rendered inline rather than fetched — it never changes between requests.
 */
function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        description: siteConfig.description,
        email: siteConfig.email,
        telephone: siteConfig.phone,
      },
      {
        '@type': 'WebSite',
        '@id': `${siteConfig.url}/#website`,
        url: siteConfig.url,
        name: siteConfig.name,
        publisher: { '@id': `${siteConfig.url}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteConfig.url}/pets?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Values are ours, not user input, so there is nothing to sanitise here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * Static apart from the newsletter island. Section order follows the funnel: show the animals
 * first, build trust, explain the process, then ask for something.
 */
export default function HomePage() {
  return (
    <>
      <StructuredData />
      <Hero />
      <TrustedOrgs />
      {/* Scoped Suspense: only this section waits on the API, everything else paints straight away. */}
      <Suspense fallback={<FeaturedPetsSkeleton />}>
        <FeaturedPets />
      </Suspense>
      <Categories />
      <WhyAdopt />
      <Stats />
      <HowItWorks />
      <SuccessStories />
      <HappyFamilies />
      <Testimonials />
      <DonationBanner />
      <CareTips />
      <Newsletter />
    </>
  );
}
