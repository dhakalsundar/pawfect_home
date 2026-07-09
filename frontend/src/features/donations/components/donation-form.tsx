'use client';

import { useState, type FormEvent } from 'react';
import { Banknote, Heart, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/providers/auth-provider';
import { donationsService } from '@/services/donations.service';
import { ApiError } from '@/services/api-error';
import { cn } from '@/lib/utils';
import { DONATION_PRESETS, formatMoney } from '@/types/donation';

interface Props {
  shelterId?: string;
  shelterName?: string;
  petId?: string;
  petName?: string;
}

/**
 * Amounts are handled as integer cents throughout.
 *
 * The custom field takes dollars because that is what people type, and converts once, on submit,
 * with `Math.round` — `parseFloat('19.99') * 100` is `1998.9999999999998`, and truncating that
 * silently undercharges by a cent. The preset buttons never leave cents at all.
 */
export function DonationForm({ shelterId, shelterName, petId, petName }: Props) {
  const { user, isAuthenticated } = useAuth();

  const [preset, setPreset] = useState<number | null>(DONATION_PRESETS[1]);
  const [customRupees, setCustomRupees] = useState('');
  const [type, setType] = useState<'one_time' | 'monthly'>('one_time');
  const [method, setMethod] = useState<'esewa' | 'cod'>('esewa');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Amount is minor units (paisa) throughout. The custom field takes rupees and converts once,
  // with Math.round — parseFloat('19.99') * 100 is 1998.999…, and truncating undercharges a paisa.
  const amountPaisa =
    preset ?? (customRupees ? Math.round(Number.parseFloat(customRupees) * 100) : 0);
  const amountIsValid = Number.isInteger(amountPaisa) && amountPaisa >= 100;

  /**
   * eSewa cannot take a recurring charge through this form, so monthly falls back to a one-time
   * gift for the online path. COD is inherently one-time.
   */
  function submitToEsewa(fields: Record<string, string>, url: string) {
    // A real form POST navigates the browser to eSewa's hosted page — the only way to hand off.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!amountIsValid) {
      setError('Please enter an amount of Rs. 1 or more.');
      return;
    }

    setPending(true);
    try {
      const result = await donationsService.checkout({
        amount: amountPaisa,
        ...(shelterId ? { shelterId } : {}),
        ...(petId ? { petId } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        isAnonymous,
        type,
        paymentMethod: method,
        ...(isAuthenticated ? {} : { donorName: guestName, donorEmail: guestEmail }),
      });

      if (result.paymentMethod === 'esewa') {
        submitToEsewa(result.esewa.fields, result.esewa.url);
        return; // navigating away
      }

      if (result.paymentMethod === 'cod') {
        // Nothing to pay now — straight to the confirmation, with the amount for display.
        const params = new URLSearchParams({ method: 'cod', amount: String(amountPaisa) });
        window.location.href = `/donate/success?${params.toString()}`;
        return;
      }

      // Stripe (not offered in the UI, but handled defensively).
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError('Payment could not be started. Please try again.');
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : 'Something went wrong. Please try again in a moment.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  const target = petName
    ? `${petName}'s care`
    : shelterName
      ? shelterName
      : 'pets across the network';

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div>
        <p className="text-muted-foreground text-sm">
          Your donation supports <span className="text-foreground font-medium">{target}</span>.
        </p>
      </div>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Choose an amount</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DONATION_PRESETS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => {
                setPreset(cents);
                setCustomRupees('');
              }}
              aria-pressed={preset === cents}
              className={cn(
                'focus-visible:ring-ring rounded-2xl border px-4 py-3 font-semibold transition-all focus-visible:ring-2 focus-visible:outline-none',
                preset === cents
                  ? 'border-primary bg-brand-50 text-primary-strong shadow-soft'
                  : 'hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              {formatMoney(cents)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <Label htmlFor="custom-amount" className="sr-only">
            Custom amount in rupees
          </Label>
          <div className="relative">
            <span
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
              aria-hidden
            >
              Rs.
            </span>
            <Input
              id="custom-amount"
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              placeholder="Other amount"
              value={customRupees}
              onChange={(event) => {
                setCustomRupees(event.target.value);
                setPreset(null);
              }}
              className="rounded-2xl pl-10"
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">How often?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['one_time', 'One time'],
              ['monthly', 'Monthly'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={cn(
                'focus-visible:ring-ring rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:outline-none',
                type === value
                  ? 'border-primary bg-brand-50 text-primary-strong'
                  : 'hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Payment method</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: 'esewa',
                title: 'eSewa',
                hint: 'Pay online instantly',
              },
              {
                value: 'cod',
                title: 'Cash',
                hint: 'Pay the shelter in person',
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMethod(option.value)}
              aria-pressed={method === option.value}
              className={cn(
                'focus-visible:ring-ring flex flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-left transition-all focus-visible:ring-2 focus-visible:outline-none',
                method === option.value
                  ? 'border-primary bg-brand-50 shadow-soft'
                  : 'hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              <span
                className={cn(
                  'flex items-center gap-1.5 text-sm font-semibold',
                  method === option.value && 'text-primary-strong',
                )}
              >
                {option.value === 'esewa' ? (
                  <Wallet className="size-4" aria-hidden />
                ) : (
                  <Banknote className="size-4" aria-hidden />
                )}
                {option.title}
              </span>
              <span className="text-muted-foreground text-xs">{option.hint}</span>
            </button>
          ))}
        </div>
        {method === 'cod' ? (
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Your pledge is recorded now and the shelter confirms it once they receive the cash.
          </p>
        ) : null}
      </fieldset>

      {!isAuthenticated ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="donor-name">Your name</Label>
            <Input
              id="donor-name"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              autoComplete="name"
              required
              className="mt-1.5 rounded-2xl"
            />
          </div>
          <div>
            <Label htmlFor="donor-email">Email for your receipt</Label>
            <Input
              id="donor-email"
              type="email"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
              autoComplete="email"
              required
              className="mt-1.5 rounded-2xl"
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your receipt will go to <span className="text-foreground font-medium">{user?.email}</span>.
        </p>
      )}

      <div>
        <Label htmlFor="donation-message">Leave a message (optional)</Label>
        <textarea
          id="donation-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Why you're giving, or who you're giving in honour of."
          className="border-input bg-background focus-visible:ring-ring mt-1.5 w-full resize-y rounded-2xl border px-4 py-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <p className="text-muted-foreground mt-1 text-xs">{message.length}/300</p>
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="anonymous"
          checked={isAnonymous}
          onCheckedChange={(checked) => setIsAnonymous(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor="anonymous" className="text-sm leading-snug font-normal">
          Donate anonymously
          <span className="text-muted-foreground block text-xs">
            Your name will not appear publicly. The shelter still sees it on their receipt.
          </span>
        </Label>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending || !amountIsValid}
        className="bg-brand-gradient w-full gap-2 rounded-2xl text-white"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {method === 'esewa' ? 'Redirecting to eSewa…' : 'Recording your pledge…'}
          </>
        ) : (
          <>
            <Heart className="size-4" aria-hidden />
            {method === 'cod' ? 'Pledge' : 'Donate'} {amountIsValid ? formatMoney(amountPaisa) : ''}
            {type === 'monthly' && amountIsValid ? ' / month' : ''}
          </>
        )}
      </Button>

      <p className="text-muted-foreground text-center text-xs">
        {method === 'esewa'
          ? 'You’ll be redirected to eSewa to complete payment securely.'
          : 'No payment is taken now — you pay the shelter directly.'}
      </p>
    </form>
  );
}
