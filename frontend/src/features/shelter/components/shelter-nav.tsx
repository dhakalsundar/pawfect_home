'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, HeartHandshake, Inbox, PawPrint, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { User } from '@/types/auth';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/shelter', label: 'Overview', icon: BarChart3, exact: true },
  { href: '/shelter/pets', label: 'My pets', icon: PawPrint, exact: false },
  { href: '/shelter/applications', label: 'Applications', icon: Inbox, exact: false },
  { href: '/shelter/donations', label: 'Donations', icon: HeartHandshake, exact: false },
  { href: '/shelter/reviews', label: 'Reviews', icon: Star, exact: false },
] as const;

export function ShelterNav({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Badge variant="secondary" className="mb-2 gap-1.5 capitalize">
          <PawPrint className="size-3.5" />
          {user.role === 'admin' ? 'Admin view' : 'Shelter'}
        </Badge>
        <p className="truncate font-semibold">{user.name}</p>
      </div>

      <Button asChild className="bg-brand-gradient w-full gap-1.5 border-0 text-white">
        <Link href="/shelter/pets/new">
          <Plus className="size-4" />
          Add a pet
        </Link>
      </Button>

      {/* Horizontal on mobile, vertical from lg — a sidebar would eat a phone screen. */}
      <nav aria-label="Shelter dashboard">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {ITEMS.map(({ href, label, icon: Icon, exact }) => {
            // Without the exact flag, /shelter would light up on every child route.
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href} className="shrink-0 lg:shrink">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-brand-50 text-primary-strong'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
