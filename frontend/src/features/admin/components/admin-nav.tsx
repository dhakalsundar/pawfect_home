'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, PawPrint, ScrollText, ShieldAlert, ShieldCheck, Users , Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/types/auth';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/shelters', label: 'Shelters', icon: Building2, exact: false },
  { href: '/admin/pets', label: 'Listings', icon: PawPrint, exact: false },
  { href: '/admin/reviews', label: 'Reviews', icon: Star, exact: false },
  { href: '/admin/audit-logs', label: 'Audit log', icon: ScrollText, exact: false },
  { href: '/admin/security-logs', label: 'Security log', icon: ShieldAlert, exact: false },
] as const;

export function AdminNav({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Badge variant="secondary" className="mb-2 gap-1.5">
          <ShieldCheck className="size-3.5" />
          Admin
        </Badge>
        <p className="truncate font-semibold">{user.name}</p>
        <p className="text-muted-foreground truncate text-xs">{user.email}</p>
      </div>

      <nav aria-label="Admin">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {ITEMS.map(({ href, label, icon: Icon, exact }) => {
            // Without the exact flag, /admin lights up on every child route.
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
