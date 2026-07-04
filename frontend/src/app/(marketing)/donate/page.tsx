import type { Metadata } from 'next';
import { HandHeart, PiggyBank, Stethoscope, Users } from 'lucide-react';
import { DonationForm } from '@/features/donations/components/donation-form';
import { DonorWall } from '@/features/donations/components/donor-wall';
import { donationsServer } from '@/services/donations.server';
import { formatMoney } from '@/types/donation';

export const metadata: Metadata = {
  title: 'Donate',
  description:
    'Support the shelters on PawfectHome. Every donation goes towards food, veterinary care and a warm place to sleep.',
  alternates: { canonical: '/donate' },
};

const IMPACT = [
  { icon: PiggyBank, amount: 'Rs. 500', text: 'feeds a cat for two weeks' },
  { icon: Stethoscope, amount: 'Rs. 1,000', text: 'covers a routine vaccination' },
  { icon: HandHeart, amount: 'Rs. 2,500', text: 'pays for a microchip and registration' },
  { icon: Users, amount: 'Rs. 5,000', text: 'funds a full intake exam for a new arrival' },
];

export default async function DonatePage() {
  const stats = await donationsServer.stats();

  return (
    <div className="pb-20">
      {/*
        `.reveal` rather than the motion wrappers: those SSR at opacity 0 and stay invisible until
        React hydrates, which would leave this hero blank without JavaScript. See CLAUDE.md §13.
      */}
      <section className="bg-brand-glow relative overflow-hidden px-4 py-16 sm:py-24">
        <div className="reveal mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Help them <span className="text-brand-gradient">get home</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg leading-relaxed">
            Every shelter on PawfectHome runs on donations. Yours pays for food, veterinary care and
            a warm place to sleep while these animals wait for their families.
          </p>

          {stats.count > 0 ? (
            <dl className="mt-10 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-muted-foreground text-xs tracking-wide uppercase">Raised</dt>
                <dd className="text-brand-gradient mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                  {formatMoney(stats.total)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs tracking-wide uppercase">Donations</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{stats.count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs tracking-wide uppercase">Supporters</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                  {stats.donorCount}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[1fr_26rem]">
        <div className="order-2 space-y-12 lg:order-1">
          <section aria-labelledby="impact-heading">
            <h2 id="impact-heading" className="text-2xl font-bold">
              Where your money goes
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {IMPACT.map(({ icon: Icon, amount, text }) => (
                <li key={amount} className="bg-card shadow-soft flex gap-4 rounded-2xl border p-5">
                  <span className="bg-brand-50 text-primary-strong grid size-11 shrink-0 place-items-center rounded-xl">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <p className="text-sm leading-relaxed">
                    <span className="block font-semibold">{amount}</span>
                    <span className="text-muted-foreground">{text}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="wall-heading">
            <h2 id="wall-heading" className="text-2xl font-bold">
              Recent supporters
            </h2>
            <p className="text-muted-foreground mt-1 mb-6 text-sm">
              Thank you to everyone keeping these shelters running.
            </p>
            <DonorWall donations={stats.recent} />
          </section>
        </div>

        <aside className="order-1 lg:order-2">
          {/* Sticky on desktop so the form stays reachable while reading the impact copy. */}
          <div className="bg-card shadow-lift rounded-2xl border p-6 lg:sticky lg:top-24">
            <h2 className="mb-5 text-xl font-bold">Make a donation</h2>
            <DonationForm />
          </div>
        </aside>
      </div>
    </div>
  );
}
