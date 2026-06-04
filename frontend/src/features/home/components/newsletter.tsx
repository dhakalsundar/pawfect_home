'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Container } from '@/components/shared/container';
import { http } from '@/services/http';
import { isApiError } from '@/services/api-error';

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.'),
  /** Honeypot — see the matching field in the backend validator. */
  website: z.string().max(0).optional(),
});

type FormValues = z.infer<typeof schema>;

export function Newsletter() {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', website: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await http.post('/newsletter', { ...values, source: 'homepage' });
      setDone(true);
    } catch (error) {
      setFormError(isApiError(error) ? error.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <section className="py-16 sm:py-20" aria-labelledby="newsletter-heading">
      <Container width="md">
        <div className="bg-card shadow-lift rounded-3xl border p-8 text-center sm:p-12">
          <span className="bg-brand-50 text-primary-strong mx-auto mb-5 grid size-14 place-items-center rounded-2xl">
            {done ? <CheckCircle2 className="size-7" /> : <Mail className="size-7" />}
          </span>

          {done ? (
            <div aria-live="polite">
              <h2 className="text-2xl font-bold sm:text-3xl">Almost there</h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-md text-pretty">
                Check your inbox and confirm your subscription. We send one email a month — new
                arrivals near you, and stories from families who adopted.
              </p>
            </div>
          ) : (
            <>
              <h2 id="newsletter-heading" className="text-2xl font-bold sm:text-3xl">
                New pets, once a month
              </h2>
              <p className="text-muted-foreground mx-auto mt-3 max-w-md text-pretty">
                No spam, no fundraising blasts. Just animals looking for homes near you, and the
                occasional happy ending. Unsubscribe in one click.
              </p>

              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
              >
                <div className="flex-1 text-left">
                  <label htmlFor="newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <Input
                    id="newsletter-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'newsletter-error' : undefined}
                    {...register('email')}
                  />
                  {errors.email || formError ? (
                    <p
                      id="newsletter-error"
                      role="alert"
                      className="text-destructive mt-1.5 text-xs font-medium"
                    >
                      {errors.email?.message ?? formError}
                    </p>
                  ) : null}
                </div>

                {/*
                  Honeypot. Hidden from sight AND from assistive tech, and removed from the tab
                  order — a screen reader user must never be asked to fill this. Bots that fill
                  every field give themselves away. Not `display:none`, which some bots detect.
                */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <label htmlFor="website">Leave this field empty</label>
                  <input id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-brand-gradient hover:shadow-glow shrink-0 border-0 text-white transition-shadow"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Subscribing…
                    </>
                  ) : (
                    'Subscribe'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
