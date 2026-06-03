'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Heart,
  LayoutDashboard,
  LogOut,
  PawPrint,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/providers/auth-provider';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserMenu() {
  const { user, logout, isLoading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  // Signed out: show the sign-in pair instead.
  if (!user) {
    return (
      <>
        <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button
          asChild
          size="sm"
          className="bg-brand-gradient hover:shadow-glow hidden border-0 text-white transition-shadow md:inline-flex"
        >
          <Link href="/register">Get started</Link>
        </Button>
      </>
    );
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  const roleLinks =
    user.role === 'admin'
      ? [{ href: '/admin', label: 'Admin panel', icon: ShieldCheck }]
      : user.role === 'shelter'
        ? [{ href: '/shelter', label: 'Shelter dashboard', icon: PawPrint }]
        : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            {user.avatar?.url ? <AvatarImage src={user.avatar.url} alt="" /> : null}
            <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-semibold">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/favorites">
            <Heart className="size-4" />
            Favorites
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">
            <UserIcon className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>

        {roleLinks.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            {roleLinks.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          disabled={signingOut || isLoading}
          variant="destructive"
        >
          <LogOut className="size-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
