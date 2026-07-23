import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { UserActions } from '@/features/admin/components/user-actions';
import { adminServer } from '@/services/admin.server';
import { requireRole } from '@/services/session';
import type { UserRole, UserStatus } from '@/types/auth';

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false, follow: false },
};

const ROLE_TONE: Record<UserRole, string> = {
  admin: 'bg-brand-100 text-brand-700 border-0',
  shelter: 'bg-info/10 text-info border-0',
  user: 'bg-muted text-muted-foreground border-0',
};

const STATUS_TONE: Record<UserStatus, string> = {
  active: 'bg-success/10 text-success border-0',
  suspended: 'bg-warning/15 text-warning border-0',
  banned: 'bg-destructive/10 text-destructive border-0',
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'role=user', label: 'Adopters' },
  { key: 'role=shelter', label: 'Shelters' },
  { key: 'role=admin', label: 'Admins' },
  { key: 'status=suspended', label: 'Suspended' },
  { key: 'status=banned', label: 'Banned' },
];

function formatDate(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const me = await requireRole(['admin']);

  const { items, meta } = await adminServer.users({
    q: params.q,
    role: params.role as UserRole | undefined,
    status: params.status as UserStatus | undefined,
    page: params.page ? Number(params.page) : 1,
  });

  const activeFilter = params.role ? `role=${params.role}` : params.status ? `status=${params.status}` : '';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">
          {meta.total.toLocaleString()} account{meta.total === 1 ? '' : 's'}
        </p>
      </div>

      {/* A plain GET form, so search works without JavaScript and the result is a shareable URL. */}
      <form className="mb-4 flex gap-2" action="/admin/users">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <label htmlFor="user-search" className="sr-only">
            Search users by name or email
          </label>
          <Input
            id="user-search"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            placeholder="Name or email…"
            className="pl-9"
          />
        </div>
      </form>

      <nav aria-label="Filter users" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = activeFilter === filter.key;
          return (
            <Link
              key={filter.label}
              href={filter.key ? `/admin/users?${filter.key}` : '/admin/users'}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bg-brand-50 text-primary-strong rounded-lg px-3 py-1.5 text-sm font-medium'
                  : 'text-muted-foreground hover:bg-muted rounded-lg px-3 py-1.5 text-sm transition-colors'
              }
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description="Try a different search or filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Platform users</caption>
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2 pr-4 font-medium">Role</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 pr-4 font-medium">Joined</th>
                <th scope="col" className="py-2 pr-4 font-medium">Last seen</th>
                <th scope="col" className="py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge className={ROLE_TONE[user.role]}>{user.role}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge className={STATUS_TONE[user.status]}>{user.status}</Badge>
                  </td>
                  <td className="text-muted-foreground py-3 pr-4 whitespace-nowrap">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="text-muted-foreground py-3 pr-4 whitespace-nowrap">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="py-3 text-right">
                    <UserActions
                      userId={user.id}
                      name={user.name}
                      role={user.role}
                      status={user.status}
                      isSelf={user.id === me.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
