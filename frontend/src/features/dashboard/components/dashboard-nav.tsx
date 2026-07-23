'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  Star,
  Bell,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  MessageSquare,
  PawPrint,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { User } from '@/types/auth';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/favorites', label: 'Favourites', icon: Heart, exact: false },
  { href: '/dashboard/applications', label: 'Applications', icon: PawPrint, exact: false },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare, exact: false },
  { href: '/dashboard/donations', label: 'Donations', icon: HeartHandshake, exact: false },
  { href: '/dashboard/reviews', label: 'Reviews', icon: Star, exact: false },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, exact: false },
  { href: '/dashboard/profile', label: 'Profile', icon: UserIcon, exact: false },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, exact: false },
] as const;

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function DashboardNav({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card shadow-soft flex items-center gap-3 rounded-2xl border p-4">
        <Avatar className="size-11">
          {user.avatar?.url ? <AvatarImage src={user.avatar.url} alt="" /> : null}
          <AvatarFallback className="bg-brand-gradient text-sm font-semibold text-white">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
      </div>

      {/* Horizontally scrollable on mobile, vertical from lg — a sidebar would eat the whole
          screen on a phone. */}
      <nav aria-label="Dashboard">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {ITEMS.map(({ href, label, icon: Icon, exact }) => {
            // Without the exact flag, /dashboard would light up on every child route.
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

      {user.role !== 'user' ? (
        <div className="bg-muted/40 rounded-2xl border border-dashed p-4">
          <Badge variant="secondary" className="mb-2 gap-1.5 capitalize">
            <ShieldCheck className="size-3.5" />
            {user.role}
          </Badge>
          <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
            {user.role === 'shelter'
              ? 'You also manage a shelter. Its listings, applications and analytics live in the shelter dashboard.'
              : 'You have administrator access. Moderation, users and audit logs live in the admin panel.'}
          </p>
          <Link
            href={user.role === 'shelter' ? '/shelter' : '/admin'}
            className="text-primary-strong inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
          >
            {user.role === 'shelter' ? 'Go to shelter dashboard' : 'Go to admin panel'}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
