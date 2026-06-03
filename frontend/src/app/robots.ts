import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /**
         * Signed-in areas are disallowed as a courtesy to crawlers, not as protection — every one
         * of these already redirects without a session, and the API enforces authorization
         * regardless. robots.txt is a request, never a security control, so nothing here is the
         * only thing standing between a bot and private data.
         */
        disallow: ['/dashboard/', '/shelter/', '/admin/', '/adopt/', '/donate/success', '/403'],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
