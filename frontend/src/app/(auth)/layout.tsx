import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { siteConfig } from '@/config/site';

/**
 * Centred-card shell with no navbar or footer — a focused shell keeps attention on the form.
 * This is why (auth) is its own route group rather than living under (marketing).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="bg-brand-glow relative flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-6 py-6">
        <Logo />
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to site
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </div>

      <p className="text-muted-foreground px-6 py-6 text-center text-xs">
        © {new Date().getFullYear()} {siteConfig.name}
      </p>
    </main>
  );
}
