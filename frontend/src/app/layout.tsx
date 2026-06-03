import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider } from '@/providers/auth-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { NotificationProvider } from '@/providers/notification-provider';
import { Toaster } from '@/components/ui/sonner';
import { getSession } from '@/services/session';
import { siteConfig } from '@/config/site';
import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

// Display face for headings — warmer and rounder than Geist, which suits the brand.
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: ['pet adoption', 'adopt a dog', 'adopt a cat', 'animal shelter', 'rescue pets'],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfcfa' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1614' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Resolved on the server so the very first paint already knows whether anyone is signed in —
  // fetching this on the client would flash a signed-out navbar on every page load.
  const user = await getSession();

  return (
    // suppressHydrationWarning is required here: next-themes stamps the theme class onto <html>
    // before React hydrates, so server and client markup differ by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <AuthProvider initialUser={user}>
            {/* Inside AuthProvider: it connects the socket only once a session exists. */}
            <SocketProvider>
              <NotificationProvider>
                {/* Skip link — first focusable element on the page, visible only when focused. */}
                <a
                  href="#main"
                  className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:ring-2"
                >
                  Skip to content
                </a>
                {children}
                <Toaster position="top-right" richColors closeButton />
              </NotificationProvider>
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
