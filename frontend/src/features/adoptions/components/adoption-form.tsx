'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { adoptionsService } from '@/services/adoptions.service';
import { isApiError } from '@/services/api-error';
import {
  STEPS,
  STEP_FIELDS,
  adoptionFormSchema,
  type AdoptionFormValues,
} from '@/lib/validation/adoption';
import type { PetDetail } from '@/types/pet';
import { cn } from '@/lib/utils';

const DRAFT_KEY_PREFIX = 'pawfect:adoption-draft:';

const DEFAULTS: Partial<AdoptionFormValues> = {
  hasYard: false,
  hasChildren: false,
  childrenAges: [],
  householdSize: 1,
  hoursAlonePerDay: 4,
  otherPets: '',
  previousPets: '',
  vetName: '',
  vetPhone: '',
  reasonForAdopting: '',
  references: [],
};

function RadioCards<T extends string>({
  name,
  value,
  options,
  onChange,
  error,
}: {
  name: string;
  value: T | undefined;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <div>
      {/* A real radiogroup, not styled checkboxes — arrow keys and screen readers depend on it. */}
      <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
              value === option.value
                ? 'border-primary bg-primary/5 ring-primary/20 ring-2'
                : 'hover:bg-muted/50',
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            {option.hint ? (
              <span className="text-muted-foreground text-xs">{option.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-1.5 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className={error ? 'text-destructive' : undefined}>
        {label}
      </Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdoptionForm({ pet }: { pet: PetDetail }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const draftKey = `${DRAFT_KEY_PREFIX}${pet.id}`;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdoptionFormValues>({
    resolver: zodResolver(adoptionFormSchema) as Resolver<AdoptionFormValues>,
    mode: 'onBlur',
    defaultValues: DEFAULTS as AdoptionFormValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'references' });

  /**
   * useWatch throughout, never the destructured watch(): watch returns a fresh function on every
   * render, which the React Compiler cannot memoize, so it bails out of optimising this (large)
   * component entirely.
   */
  const values = useWatch({ control });
  const ownOrRent = values.ownOrRent;
  const hasChildren = values.hasChildren ?? false;
  const childrenAges = values.childrenAges ?? [];
  const housingType = values.housingType;
  const experienceLevel = values.experienceLevel;
  const hasYard = values.hasYard ?? false;
  const agreedToTerms = values.agreedToTerms;
  const landlordApproval = values.landlordApproval;
  const reason = values.reasonForAdopting ?? '';

  /**
   * Restore a saved draft on mount.
   *
   * This form is long enough that losing it to an accidental refresh would be genuinely costly,
   * and a half-finished application is exactly the sort of thing people come back to.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (!saved) return;

      const parsed = JSON.parse(saved) as { values: Partial<AdoptionFormValues>; at: string };
      for (const [key, value] of Object.entries(parsed.values)) {
        // setValue writes to react-hook-form's own store — an external system, which is exactly
        // what effects are for. No component state is set here: the "Draft saved" indicator is
        // driven by the autosave effect below, which runs moments later anyway.
        if (value !== undefined) setValue(key as keyof AdoptionFormValues, value as never);
      }

      toast.info('We restored your saved answers.');
    } catch {
      // A corrupt draft should never block the form.
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey, setValue]);

  /**
   * Autosave, debounced.
   *
   * Driven by the useWatch value rather than a watch() subscription: react-hook-form ignores
   * whatever a subscription callback returns, so a cleanup declared in there never runs and the
   * debounce timers simply accumulate. An effect keyed on the values gets a real cleanup.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const at = new Date();
        window.localStorage.setItem(draftKey, JSON.stringify({ values, at: at.toISOString() }));
        setDraftSavedAt(at);
      } catch {
        // Storage full or blocked (private browsing) — autosave is a nicety, not a requirement.
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [values, draftKey]);

  async function goNext() {
    // Validate only the current step's fields, so step 1 errors do not block step 2.
    const valid = await trigger(STEP_FIELDS[step] as never, { shouldFocus: true });
    if (!valid) return;

    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    // Move focus to the new step heading — otherwise a keyboard user is left on a button that
    // now belongs to a different step.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function onSubmit(values: AdoptionFormValues) {
    setFormError(null);
    try {
      const application = await adoptionsService.submit({
        petId: pet.id,
        answers: {
          housingType: values.housingType,
          ownOrRent: values.ownOrRent,
          landlordApproval: values.landlordApproval,
          hasYard: values.hasYard,
          householdSize: values.householdSize,
          hasChildren: values.hasChildren,
          childrenAges: values.childrenAges,
          otherPets: values.otherPets,
          previousPets: values.previousPets,
          hoursAlonePerDay: values.hoursAlonePerDay,
          experienceLevel: values.experienceLevel,
          reasonForAdopting: values.reasonForAdopting,
          vetName: values.vetName,
          vetPhone: values.vetPhone,
        },
        // Drop rows the user started and abandoned.
        references: values.references.filter((ref) => ref.name?.trim()),
        agreedToTerms: true,
      });

      window.localStorage.removeItem(draftKey);
      router.push(`/dashboard/applications/${application.id}?submitted=1`);
    } catch (error) {
      if (isApiError(error)) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            // Server paths look like "answers.reasonForAdopting"; the form knows the leaf name.
            const leaf = field.split('.').pop() as keyof AdoptionFormValues;
            setError(leaf, { message });
          }
          setFormError('Please check the highlighted answers.');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      // Enter inside a text field would otherwise submit a half-finished application from step 1.
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !isLastStep && (event.target as HTMLElement).tagName !== 'TEXTAREA') {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-6"
    >
      {/* Progress */}
      <ol className="flex items-center gap-2" aria-label="Application progress">
        {STEPS.map((s, index) => (
          <li key={s.title} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                index < step && 'bg-success text-white',
                index === step && 'bg-brand-gradient text-white',
                index > step && 'bg-muted text-muted-foreground',
              )}
              aria-current={index === step ? 'step' : undefined}
            >
              {index < step ? <Check className="size-4" /> : index + 1}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                className={cn('h-0.5 flex-1 rounded-full', index < step ? 'bg-success' : 'bg-muted')}
                aria-hidden="true"
              />
            ) : null}
          </li>
        ))}
      </ol>

      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          {STEPS[step]!.title}
        </h2>
        <p className="text-muted-foreground text-sm">
          Step {step + 1} of {STEPS.length} · {STEPS[step]!.description}
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Separator />

      {/* --- Step 1: household -------------------------------------------- */}
      {step === 0 ? (
        <div className="flex flex-col gap-5">
          <Field label="What kind of home do you live in?" error={errors.housingType?.message}>
            <RadioCards
              name="Housing type"
              value={housingType}
              onChange={(value) => setValue('housingType', value, { shouldValidate: true })}
              options={[
                { value: 'house', label: 'House' },
                { value: 'apartment', label: 'Apartment' },
                { value: 'condo', label: 'Condo' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </Field>

          <Field label="Do you own or rent?" error={errors.ownOrRent?.message}>
            <RadioCards
              name="Own or rent"
              value={ownOrRent}
              onChange={(value) => setValue('ownOrRent', value, { shouldValidate: true })}
              options={[
                { value: 'own', label: 'I own my home' },
                { value: 'rent', label: 'I rent' },
              ]}
            />
          </Field>

          {ownOrRent === 'rent' ? (
            <div className="border-warning/40 bg-warning/10 rounded-xl border p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="landlordApproval"
                  checked={Boolean(landlordApproval)}
                  onCheckedChange={(checked) =>
                    setValue('landlordApproval', checked === true, { shouldValidate: true })
                  }
                  className="mt-0.5"
                />
                <label htmlFor="landlordApproval" className="text-sm leading-relaxed">
                  I confirm my landlord allows pets at this property.
                </label>
              </div>
              {errors.landlordApproval ? (
                <p role="alert" className="text-destructive mt-1.5 text-xs font-medium">
                  {errors.landlordApproval.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="hasYard"
              checked={hasYard}
              onCheckedChange={(checked) => setValue('hasYard', checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="hasYard" className="text-sm leading-relaxed">
              I have a garden or outdoor space
            </label>
          </div>

          <Field
            label="How many people live in your household?"
            htmlFor="householdSize"
            error={errors.householdSize?.message}
          >
            <Input
              id="householdSize"
              type="number"
              min={1}
              max={20}
              className="max-w-32"
              {...register('householdSize')}
            />
          </Field>

          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="hasChildren"
                checked={hasChildren}
                onCheckedChange={(checked) => {
                  setValue('hasChildren', checked === true, { shouldValidate: true });
                  if (checked !== true) setValue('childrenAges', []);
                }}
                className="mt-0.5"
              />
              <label htmlFor="hasChildren" className="text-sm leading-relaxed">
                There are children in the household
              </label>
            </div>

            {hasChildren ? (
              <div className="border-l-2 pl-4">
                <Label className="mb-2 block text-sm">Children&apos;s ages</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {childrenAges.map((age, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={25}
                        value={age}
                        onChange={(event) => {
                          const next = [...childrenAges];
                          next[index] = Number(event.target.value);
                          setValue('childrenAges', next, { shouldValidate: true });
                        }}
                        className="w-20"
                        aria-label={`Age of child ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValue(
                            'childrenAges',
                            childrenAges.filter((_, i) => i !== index),
                            { shouldValidate: true },
                          )
                        }
                        className="text-muted-foreground hover:text-destructive grid size-8 place-items-center rounded-lg transition-colors"
                        aria-label={`Remove child ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setValue('childrenAges', [...childrenAges, 5], { shouldValidate: true })
                    }
                    className="gap-1.5"
                  >
                    <Plus className="size-3.5" />
                    Add a child
                  </Button>
                </div>
                {errors.childrenAges ? (
                  <p role="alert" className="text-destructive mt-1.5 text-xs font-medium">
                    {errors.childrenAges.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* --- Step 2: experience ------------------------------------------- */}
      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <Field label="How much experience do you have with pets?" error={errors.experienceLevel?.message}>
            <RadioCards
              name="Experience level"
              value={experienceLevel}
              onChange={(value) => setValue('experienceLevel', value, { shouldValidate: true })}
              options={[
                { value: 'none', label: 'First-time owner', hint: 'Plenty of pets suit beginners' },
                { value: 'some', label: 'Some experience', hint: 'I have had a pet before' },
                { value: 'experienced', label: 'Very experienced', hint: 'Including rescues' },
              ]}
            />
          </Field>

          <Field
            label="How many hours a day would the pet be alone?"
            htmlFor="hoursAlonePerDay"
            hint="Be honest — shelters match animals to real routines, not ideal ones."
            error={errors.hoursAlonePerDay?.message}
          >
            <Input
              id="hoursAlonePerDay"
              type="number"
              min={0}
              max={24}
              className="max-w-32"
              {...register('hoursAlonePerDay')}
            />
          </Field>

          <Field
            label="Do you have other pets?"
            htmlFor="otherPets"
            hint="Species, ages and temperaments help enormously."
            error={errors.otherPets?.message}
          >
            <textarea
              id="otherPets"
              rows={3}
              placeholder="e.g. One 6-year-old female cat, quite shy with newcomers."
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              {...register('otherPets')}
            />
          </Field>

          <Field
            label="Tell us about pets you have had before"
            htmlFor="previousPets"
            error={errors.previousPets?.message}
          >
            <textarea
              id="previousPets"
              rows={3}
              placeholder="Optional — what happened to them, and what you learned."
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              {...register('previousPets')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your vet's name (optional)" htmlFor="vetName" error={errors.vetName?.message}>
              <Input id="vetName" {...register('vetName')} />
            </Field>
            <Field label="Vet phone (optional)" htmlFor="vetPhone" error={errors.vetPhone?.message}>
              <Input id="vetPhone" type="tel" {...register('vetPhone')} />
            </Field>
          </div>
        </div>
      ) : null}

      {/* --- Step 3: motivation ------------------------------------------- */}
      {step === 2 ? (
        <div className="flex flex-col gap-5">
          <Field
            label={`Why would you like to adopt ${pet.name}?`}
            htmlFor="reasonForAdopting"
            hint="This is the part shelters actually read. A few honest sentences beat a perfect one."
            error={errors.reasonForAdopting?.message}
          >
            <textarea
              id="reasonForAdopting"
              rows={7}
              placeholder={`What drew you to ${pet.name}, what your days look like, and what kind of home they would be joining.`}
              className="border-input bg-transparent focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              {...register('reasonForAdopting')}
            />
            <p
              className={cn(
                'text-right text-xs tabular-nums',
                reason.length < 30 ? 'text-muted-foreground' : 'text-success',
              )}
              aria-live="polite"
            >
              {reason.length} / 1000 {reason.length < 30 ? `(${30 - reason.length} more needed)` : ''}
            </p>
          </Field>
        </div>
      ) : null}

      {/* --- Step 4: references + terms ----------------------------------- */}
      {step === 3 ? (
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="font-semibold">References (optional)</h3>
            <p className="text-muted-foreground text-sm">
              A vet, a previous shelter, or someone who knows you with animals. Up to three.
            </p>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="bg-muted/30 flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Reference {index + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-muted-foreground hover:text-destructive grid size-8 place-items-center rounded-lg transition-colors"
                  aria-label={`Remove reference ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor={`ref-name-${index}`}>
                  <Input id={`ref-name-${index}`} {...register(`references.${index}.name`)} />
                </Field>
                <Field label="Relationship" htmlFor={`ref-rel-${index}`}>
                  <Input
                    id={`ref-rel-${index}`}
                    placeholder="e.g. Veterinarian"
                    {...register(`references.${index}.relationship`)}
                  />
                </Field>
                <Field label="Phone" htmlFor={`ref-phone-${index}`}>
                  <Input id={`ref-phone-${index}`} type="tel" {...register(`references.${index}.phone`)} />
                </Field>
                <Field label="Email (optional)" htmlFor={`ref-email-${index}`}>
                  <Input id={`ref-email-${index}`} type="email" {...register(`references.${index}.email`)} />
                </Field>
              </div>
            </div>
          ))}

          {errors.references?.message ? (
            <p role="alert" className="text-destructive text-xs font-medium">
              {errors.references.message}
            </p>
          ) : null}

          {fields.length < 3 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ name: '', relationship: '', phone: '', email: '' })}
              className="gap-1.5 self-start"
            >
              <Plus className="size-4" />
              Add a reference
            </Button>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="agreedToTerms"
                checked={Boolean(agreedToTerms)}
                onCheckedChange={(checked) =>
                  setValue('agreedToTerms', (checked === true) as true, { shouldValidate: true })
                }
                className="mt-0.5"
              />
              <label htmlFor="agreedToTerms" className="text-sm leading-relaxed">
                I confirm the information above is accurate, and I understand that submitting this
                application does not guarantee adoption and is not a binding commitment.
              </label>
            </div>
            {errors.agreedToTerms ? (
              <p role="alert" className="text-destructive text-xs font-medium">
                {errors.agreedToTerms.message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Separator />

      <div className="flex items-center justify-between gap-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {draftSavedAt ? (
            <>
              <Save className="size-3.5" />
              Draft saved
            </>
          ) : null}
        </div>

        <div className="flex gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting}>
              <ArrowLeft />
              Back
            </Button>
          ) : null}

          {isLastStep ? (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-brand-gradient border-0 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Submit application
                  <Check />
                </>
              )}
            </Button>
          ) : (
            <Button type="button" onClick={goNext} className="bg-brand-gradient border-0 text-white">
              Continue
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
