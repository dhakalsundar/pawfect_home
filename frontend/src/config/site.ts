export const siteConfig = {
  name: "PawfectHome",
  tagline: "Every pet deserves a family",
  description:
    "Browse adoptable dogs, cats, birds and rabbits from verified shelters near you. Apply to adopt, message shelters directly, and help fund their work.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ogImage: "/images/og-default.jpg",
  email: "hello@pawfecthome.org",
  phone: "+1 (555) 018-2240",
  address: "204 Willow Lane, Portland, OR 97205",
  links: {
    twitter: "https://twitter.com/pawfecthome",
    instagram: "https://instagram.com/pawfecthome",
    facebook: "https://facebook.com/pawfecthome",
    github: "https://github.com/pawfecthome",
  },
} as const;

export type SiteConfig = typeof siteConfig;
