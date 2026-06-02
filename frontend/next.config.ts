import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Placeholder photography for Batches 3-9. Real pet images come from Cloudinary in Batch 10.
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      // Google profile pictures, for accounts created via OAuth.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
      // Batch 10.
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Surfaced by the /health endpoint and error reports so a bug can be tied to a deploy.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
