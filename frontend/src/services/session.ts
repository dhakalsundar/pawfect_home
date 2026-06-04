import 'server-only';

import { redirect } from 'next/navigation';
import { serverHttp } from './server-http';
import type { User, UserRole } from '@/types/auth';

/**
 * Resolves the signed-in user during SSR, or null.
 *
 * Never throws — an unauthenticated visitor is a normal state, not an error, and layouts call this
 * to decide what to render rather than to fail.
 */
export async function getSession(): Promise<User | null> {
  try {
    const { data } = await serverHttp.get<User>('/auth/me');
    return data;
  } catch {
    return null;
  }
}

/**
 * Guards a protected layout. This is a correctness check, not the security boundary — the backend
 * re-authorises every request regardless. Its job is to avoid rendering a dashboard shell whose
 * data calls are all going to 401 anyway.
 */
export async function requireSession(callbackUrl = '/dashboard'): Promise<User> {
  const user = await getSession();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

export async function requireRole(roles: UserRole[], callbackUrl = '/dashboard'): Promise<User> {
  const user = await requireSession(callbackUrl);
  if (!roles.includes(user.role)) redirect('/403');
  return user;
}
