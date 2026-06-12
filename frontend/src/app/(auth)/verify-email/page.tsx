import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { serverHttp } from '@/services/server-http';
import { isApiError } from '@/services/api-error';
import type { User } from '@/types/auth';

export const metadata: Metadata = {
  title: 'Verify email',
  robots: { index: false, follow: false },
};

/**
 * Verification runs on the server during render — the user arrives from an emailed link, so there
 * is no interaction to wait for and no reason to ship a client component that fetches on mount.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let verified = false;
  let message = 'This verification link is missing its token.';

  if (token) {
    try {
      await serverHttp.get<User>('/auth/verify-email', {
        params: { token },
        withAuth: false,
        cache: 'no-store',
      });
      verified = true;
    } catch (error) {
      message = isApiError(error)
        ? error.message
        : 'We could not verify your email. Please try again.';
    }
  }

  return (
    <div className="bg-card shadow-lift rounded-2xl border p-6 text-center sm:p-8">
      <span
        className={`mx-auto mb-4 grid size-14 place-items-center rounded-2xl ${
          verified ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        }`}
      >
        {verified ? <CheckCircle2 className="size-7" /> : <TriangleAlert className="size-7" />}
      </span>

      <h1 className="mb-2 text-2xl font-bold">
        {verified ? 'Email verified' : 'Verification failed'}
      </h1>

      <p className="text-muted-foreground text-sm leading-relaxed">
        {verified
          ? 'Your email address is confirmed. You now have full access to your PawfectHome account.'
          : message}
      </p>

      <Button asChild className="bg-brand-gradient mt-6 w-full border-0 text-white">
        <Link href={verified ? '/dashboard' : '/login'}>
          {verified ? 'Go to dashboard' : 'Back to sign in'}
        </Link>
      </Button>
    </div>
  );
}
