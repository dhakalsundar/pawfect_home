'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { FormField } from '@/components/shared/form-field';
import { ImageUploader, type ManagedImage } from './image-uploader';
import { shelterService, type PetFormPayload } from '@/services/shelter.service';
import { isApiError } from '@/services/api-error';
import type { PetDetail, Tristate } from '@/types/pet';
import { cn } from '@/lib/utils';

const petFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(50),
  species: z.enum(['dog', 'cat', 'bird', 'rabbit', 'other']),
  breed: z.string().trim().min(1, 'Breed is required.').max(80),
  ageValue: z.coerce.number({ message: 'Enter a number.' }).min(0).max(40),
  ageUnit: z.enum(['weeks', 'months', 'years']),
  gender: z.enum(['male', 'female', 'unknown']),
  size: z.enum(['small', 'medium', 'large', 'xlarge']),
  color: z.string().trim().max(40).optional(),
  description: z
    .string()
    .trim()
    .min(30, 'Please write at least 30 characters — this is what adopters actually read.')
    .max(3000),
  adoptionFee: z.coerce.number().min(0).max(100_000),
  activityLevel: z.enum(['low', 'moderate', 'high']),
  vaccinated: z.boolean(),
  neutered: z.boolean(),
  microchipped: z.boolean(),
  specialNeeds: z.boolean(),
  medicalNotes: z.string().trim().max(1000).optional(),
  goodWithKids: z.enum(['yes', 'no', 'unknown']),
  goodWithDogs: z.enum(['yes', 'no', 'unknown']),
  goodWithCats: z.enum(['yes', 'no', 'unknown']),
});

type PetFormValues = z.infer<typeof petFormSchema>;

const TEMPERAMENT_OPTIONS = [
  'playful', 'calm', 'affectionate', 'shy', 'energetic',
  'gentle', 'curious', 'independent', 'loyal', 'quiet',
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              value === option.value
                ? 'border-primary bg-primary/5 text-primary-strong font-medium'
                : 'hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const TRISTATE_OPTIONS: { value: Tristate; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not assessed' },
];

export function PetForm({ pet }: { pet?: PetDetail }) {
  const router = useRouter();
  const isEdit = Boolean(pet);
  const [formError, setFormError] = useState<string | null>(null);

  const [images, setImages] = useState<ManagedImage[]>(
    pet?.images.map((image) => ({
      url: image.url,
      // Preserved so the API can verify ownership and clean up removed photos on save.
      publicId: (image as { publicId?: string }).publicId,
      isPrimary: image.isPrimary,
    })) ?? [],
  );
  const [imageError, setImageError] = useState<string | null>(null);

  const [temperament, setTemperament] = useState<string[]>(pet?.temperament ?? []);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PetFormValues>({
    // z.coerce.number() declares its INPUT as unknown (it accepts the string an <input> produces),
    // which does not line up with the resolver's parsed-output type. The cast reconciles the two;
    // the runtime behaviour is exactly what we want — strings in, numbers out.
    resolver: zodResolver(petFormSchema) as Resolver<PetFormValues>,
    mode: 'onBlur',
    defaultValues: {
      name: pet?.name ?? '',
      species: pet?.species ?? 'dog',
      breed: pet?.breed ?? '',
      ageValue: pet?.age.value ?? 1,
      ageUnit: pet?.age.unit ?? 'years',
      gender: pet?.gender ?? 'unknown',
      size: pet?.size ?? 'medium',
      color: pet?.color ?? '',
      description: pet?.description ?? '',
      adoptionFee: pet?.adoptionFee ?? 0,
      activityLevel: pet?.activityLevel ?? 'moderate',
      vaccinated: pet?.health.vaccinated ?? false,
      neutered: pet?.health.neutered ?? false,
      microchipped: pet?.microchipped ?? false,
      specialNeeds: pet?.health.specialNeeds ?? false,
      medicalNotes: pet?.health.medicalNotes ?? '',
      goodWithKids: pet?.goodWith.kids ?? 'unknown',
      goodWithDogs: pet?.goodWith.dogs ?? 'unknown',
      goodWithCats: pet?.goodWith.cats ?? 'unknown',
    },
  });

  // useWatch, not the destructured watch() — see the note in adoption-form.tsx.
  const values = useWatch({ control });

  async function onSubmit(formValues: PetFormValues) {
    setFormError(null);

    if (images.length === 0) {
      setImageError('Add at least one photo.');
      return;
    }

    const payload: PetFormPayload = {
      name: formValues.name,
      species: formValues.species,
      breed: formValues.breed,
      age: { value: formValues.ageValue, unit: formValues.ageUnit },
      gender: formValues.gender,
      size: formValues.size,
      color: formValues.color,
      description: formValues.description,
      images,
      health: {
        vaccinated: formValues.vaccinated,
        neutered: formValues.neutered,
        microchipped: formValues.microchipped,
        specialNeeds: formValues.specialNeeds,
        medicalNotes: formValues.medicalNotes,
      },
      temperament,
      goodWith: {
        kids: formValues.goodWithKids,
        dogs: formValues.goodWithDogs,
        cats: formValues.goodWithCats,
      },
      activityLevel: formValues.activityLevel,
      adoptionFee: formValues.adoptionFee,
    };

    try {
      if (isEdit && pet) {
        await shelterService.updatePet(pet.id, payload);
        toast.success(`${payload.name} updated.`);
      } else {
        await shelterService.createPet(payload);
        toast.success(`${payload.name} added. It will appear publicly once approved.`);
      }
      router.push('/shelter/pets');
      router.refresh();
    } catch (error) {
      if (isApiError(error)) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            const leaf = field.split('.').pop();
            if (leaf && leaf in formValues) setError(leaf as keyof PetFormValues, { message });
          }
          setFormError('Please check the highlighted fields.');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Something went wrong. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-8">
      {formError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-bold">Basics</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" error={errors.name?.message} {...register('name')} />
          <FormField
            label="Breed"
            placeholder="Mixed Breed is fine"
            error={errors.breed?.message}
            {...register('breed')}
          />
        </div>

        <Segmented
          label="Species"
          value={values.species ?? 'dog'}
          onChange={(v) => setValue('species', v, { shouldValidate: true })}
          options={[
            { value: 'dog', label: 'Dog' },
            { value: 'cat', label: 'Cat' },
            { value: 'bird', label: 'Bird' },
            { value: 'rabbit', label: 'Rabbit' },
            { value: 'other', label: 'Other' },
          ]}
          error={errors.species?.message}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Age"
            type="number"
            min={0}
            error={errors.ageValue?.message}
            {...register('ageValue')}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="ageUnit">Unit</Label>
            <select
              id="ageUnit"
              className="border-input focus-visible:ring-ring h-9 rounded-lg border bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              {...register('ageUnit')}
            >
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
          <FormField
            label="Adoption fee (Rs.)"
            type="number"
            min={0}
            error={errors.adoptionFee?.message}
            {...register('adoptionFee')}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            label="Gender"
            value={values.gender ?? 'unknown'}
            onChange={(v) => setValue('gender', v)}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'unknown', label: 'Unknown' },
            ]}
          />
          <Segmented
            label="Size"
            value={values.size ?? 'medium'}
            onChange={(v) => setValue('size', v)}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
              { value: 'xlarge', label: 'XL' },
            ]}
          />
        </div>

        <FormField label="Colour" placeholder="Optional" error={errors.color?.message} {...register('color')} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold">Photos</h2>
          <p className="text-muted-foreground text-sm">
            One to eight. The starred photo is shown on cards and search results.
          </p>
        </div>

        {/* Handles uploading, the URL fallback, previews, primary selection and removal. */}
        <ImageUploader images={images} onChange={setImages} folder="pets" max={8} />

        {imageError ? (
          <p role="alert" className="text-destructive text-xs font-medium">
            {imageError}
          </p>
        ) : null}
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Description</h2>
        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="sr-only">
            Description
          </label>
          <textarea
            id="description"
            rows={7}
            placeholder="Their personality, how they are with people and other animals, what kind of home would suit them, and anything a new owner should know."
            className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            {...register('description')}
          />
          <p className="text-muted-foreground text-right text-xs tabular-nums">
            {(values.description ?? '').length} / 3000
          </p>
          {errors.description ? (
            <p role="alert" className="text-destructive text-xs font-medium">
              {errors.description.message}
            </p>
          ) : null}
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-bold">Temperament &amp; compatibility</h2>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Temperament (up to 8)</span>
          <div className="flex flex-wrap gap-2">
            {TEMPERAMENT_OPTIONS.map((trait) => {
              const selected = temperament.includes(trait);
              return (
                <button
                  key={trait}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setTemperament(
                      selected
                        ? temperament.filter((t) => t !== trait)
                        : temperament.length < 8
                          ? [...temperament, trait]
                          : temperament,
                    )
                  }
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm capitalize transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 text-primary-strong font-medium'
                      : 'hover:bg-muted',
                  )}
                >
                  {trait}
                </button>
              );
            })}
          </div>
        </div>

        <Segmented
          label="Energy level"
          value={values.activityLevel ?? 'moderate'}
          onChange={(v) => setValue('activityLevel', v)}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'high', label: 'High' },
          ]}
        />

        <div className="grid gap-5 sm:grid-cols-3">
          <Segmented
            label="Good with children"
            value={values.goodWithKids ?? 'unknown'}
            onChange={(v) => setValue('goodWithKids', v)}
            options={TRISTATE_OPTIONS}
          />
          <Segmented
            label="Good with dogs"
            value={values.goodWithDogs ?? 'unknown'}
            onChange={(v) => setValue('goodWithDogs', v)}
            options={TRISTATE_OPTIONS}
          />
          <Segmented
            label="Good with cats"
            value={values.goodWithCats ?? 'unknown'}
            onChange={(v) => setValue('goodWithCats', v)}
            options={TRISTATE_OPTIONS}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          &quot;Not assessed&quot; is shown honestly to adopters — please don&apos;t guess.
        </p>
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Health</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['vaccinated', 'Vaccinated'],
              ['neutered', 'Neutered / spayed'],
              ['microchipped', 'Microchipped'],
              ['specialNeeds', 'Has special needs'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2.5">
              <Checkbox
                id={key}
                checked={Boolean(values[key])}
                onCheckedChange={(checked) => setValue(key, checked === true)}
              />
              <label htmlFor={key} className="text-sm">
                {label}
              </label>
            </div>
          ))}
        </div>

        {values.specialNeeds ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="medicalNotes" className="text-sm font-medium">
              What should an adopter know?
            </label>
            <textarea
              id="medicalNotes"
              rows={3}
              placeholder="Ongoing medication, mobility needs, dietary requirements."
              className="border-input focus-visible:ring-ring w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              {...register('medicalNotes')}
            />
          </div>
        ) : null}
      </section>

      <Separator />

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-brand-gradient border-0 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Add pet'
          )}
        </Button>
      </div>
    </form>
  );
}
