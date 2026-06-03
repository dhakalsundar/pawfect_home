'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Heart, LayoutDashboard, LogOut, Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/shared/logo';
import { useAuth } from '@/providers/auth-provider';
import { mainNav, petCategories } from '@/config/nav';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Close on navigation. Handled by an onClick on the panel's link container rather than an
  // effect watching `pathname`: the click IS the event, so reacting to the resulting route change
  // would be synchronising state to something we already know happened.
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle asChild>
            <Logo />
          </SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
        </SheetHeader>

        {/* One handler on the container catches every link inside, including the category grid. */}
        <nav className="flex flex-col gap-1 overflow-y-auto p-4" onClick={close}>
          {mainNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col gap-0.5 rounded-xl px-4 py-3 transition-colors',
                  active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <span className="font-medium">{item.label}</span>
                {item.description ? (
                  <span className="text-muted-foreground text-xs">{item.description}</span>
                ) : null}
              </Link>
            );
          })}

          <Separator className="my-3" />

          <p className="text-muted-foreground px-4 pb-1 text-xs font-semibold tracking-wide uppercase">
            Categories
          </p>
          <div className="grid grid-cols-2 gap-2 px-1">
            {petCategories.map(({ label, value, icon: Icon }) => (
              <Link
                key={value}
                href={`/pets?species=${value}`}
                className="hover:bg-muted flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors"
              >
                <Icon className="text-primary-strong size-4" />
                {label}
              </Link>
            ))}
          </div>

          <Separator className="my-3" />

          <div className="flex flex-col gap-2 px-1">
            {user ? (
              <>
                <div className="mb-1 px-3">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
                <Button asChild variant="outline" className="w-full justify-start gap-2">
                  <Link href="/dashboard">
                    <LayoutDashboard className="size-4" />
                    Dashboard
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start gap-2">
                  <Link href="/dashboard/favorites">
                    <Heart className="size-4" />
                    Favorites
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive w-full justify-start gap-2"
                  // stopPropagation: the container's onClick closes the sheet, which would unmount
                  // this button mid-request.
                  onClick={(event) => {
                    event.stopPropagation();
                    void logout();
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild className="bg-brand-gradient w-full border-0 text-white">
                  <Link href="/register">Create account</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
