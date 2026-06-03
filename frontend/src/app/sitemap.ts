import type { MetadataRoute } from 'next';
import { petsServer } from '@/services/pets.server';
import { sheltersServer } from '@/services/shelters.server';
import { siteConfig } from '@/config/site';

/**
 * Regenerated hourly rather than per request. A sitemap listing 500 pets means 500 rows built from
 * two API calls; rebuilding that on every crawler hit is pure waste when the content changes a few
 * times a day.
 */
export const revalidate = 3600;

const STATIC_ROUTES: { path: string; priority: number; frequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, frequency: 'daily' },
  { path: '/pets', priority: 0.9, frequency: 'hourly' },
  { path: '/shelters', priority: 0.8, frequency: 'daily' },
  { path: '/donate', priority: 0.7, frequency: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteConfig.url}${route.path}`,
    lastModified: now,
    changeFrequency: route.frequency,
    priority: route.priority,
  }));

  /**
   * A failing API must not produce a 500 for a crawler — a broken sitemap is worse than a partial
   * one, because search engines back off after repeated errors. Each source degrades on its own.
   */
  try {
    // Only `available` pets: an adopted listing is already `noindex`, so advertising it here would
    // contradict the page's own directive.
    const { items } = await petsServer.listServer({ status: 'available', limit: 50, sort: 'newest' });
    entries.push(
      ...items.map((pet) => ({
        url: `${siteConfig.url}/pets/${pet.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    );
  } catch {
    // Static routes still ship.
  }

  try {
    const { items } = await sheltersServer.list({ page: 1 });
    entries.push(
      ...items.map((shelter) => ({
        url: `${siteConfig.url}/shelters/${shelter.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    );
  } catch {
    // As above.
  }

  return entries;
}
