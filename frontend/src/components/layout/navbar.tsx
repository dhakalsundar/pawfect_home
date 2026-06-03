'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heart, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/logo';
import { Container } from '@/components/shared/container';
import { ThemeToggle } from './theme-toggle';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { mainNav } from '@/config/nav';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // The navbar is transparent over the hero and gains glass + a border once the page scrolls,
  // so it never sits as an opaque bar on top of the banner image.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-[background-color,border-color,box-shadow] duration-300',
        scrolled ? 'glass border-b shadow-soft' : 'border-b border-transparent bg-transparent',
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {mainNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                  )}
                >
                  {item.label}
                  {active ? (
                    <span className="bg-brand-gradient absolute inset-x-3 -bottom-px h-0.5 rounded-full" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden size-9 sm:inline-flex"
              aria-label="Search pets"
            >
              <Link href="/pets">
                <Search className="size-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden size-9 sm:inline-flex"
              aria-label="Favorites"
            >
              <Link href="/dashboard/favorites">
                <Heart className="size-4" />
              </Link>
            </Button>

            {/* Renders nothing when signed out. */}
            <NotificationBell />

            <ThemeToggle />

            {/* Renders the avatar menu when signed in, the sign-in pair when not. */}
            <UserMenu />

            <MobileNav />
          </div>
        </div>
      </Container>
    </header>
  );
}
