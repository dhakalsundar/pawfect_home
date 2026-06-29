import { z } from 'zod';

/**
 * Mirrors backend/src/modules/adoptions/adoptions.validators.ts.
 *
 * Split per step so each one can be validated independently as the user advances — the whole form
 * is only assembled at submit. The backend re-validates everything regardless.
 */

export const householdStepSchema = z
  .object({
    housingType: z.enum(['house', 'apartment', 'condo', 'other'], {
      message: 'Please choose your housing type.',
    }),
    ownOrRent: z.enum(['own', 'rent'], { message: 'Please choose one.' }),
    landlordApproval: z.boolean().optional(),
    hasYard: z.boolean(),
    householdSize: z.coerce
      .number({ message: 'Enter a number.' })
      .int('Whole numbers only.')
      .min(1, 'At least one person.')
      .max(20, 'That seems like a lot — please contact the shelter directly.'),
    hasChildren: z.boolean(),
    childrenAges: z.array(z.coerce.number().int().min(0).max(25)).optional(),
  })
  .refine((data) => data.ownOrRent !== 'rent' || data.landlordApproval === true, {
    message: 'Shelters require confirmation that your landlord allows pets.',
    path: ['landlordApproval'],
  })
  .refine((data) => !data.hasChildren || (data.childrenAges?.length ?? 0) > 0, {
    message: 'Please add the age of each child.',
    path: ['childrenAges'],
  });

export const experienceStepSchema = z.object({
  experienceLevel: z.enum(['none', 'some', 'experienced'], {
    message: 'Please choose your experience level.',
  }),
  hoursAlonePerDay: z.coerce
    .number({ message: 'Enter a number of hours.' })
    .int('Whole hours only.')
    .min(0, 'Cannot be negative.')
    .max(24, 'There are only 24 hours in a day.'),
  otherPets: z.string().trim().max(500, 'Please keep this under 500 characters.').optional(),
  previousPets: z.string().trim().max(500, 'Please keep this under 500 characters.').optional(),
  vetName: z.string().trim().max(120).optional(),
  vetPhone: z.string().trim().max(24).optional(),
});

export const motivationStepSchema = z.object({
  reasonForAdopting: z
    .string()
    .trim()
    .min(30, 'Please write at least a couple of sentences (30 characters).')
    .max(1000, 'Please keep this under 1000 characters.'),
});

const referenceSchema = z.object({
  name: z.string().trim().max(60),
  relationship: z.string().trim().max(60),
  phone: z.string().trim().max(24),
  email: z.string().trim().max(254).optional(),
});

export const referencesStepSchema = z.object({
  references: z
    .array(referenceSchema)
    .max(3)
    // A partially-filled reference is worse than none — the shelter cannot act on a name alone.
    .refine(
      (refs) => refs.every((ref) => !ref.name || (ref.relationship.length > 0 && ref.phone.length > 0)),
      { message: 'Please complete the relationship and phone number for each reference you add.' },
    ),
  agreedToTerms: z.literal(true, { message: 'You must agree to the adoption terms.' }),
});

/** The whole form, used for the final submit. */
export const adoptionFormSchema = z.object({
  ...householdStepSchema.def.shape,
  ...experienceStepSchema.shape,
  ...motivationStepSchema.shape,
  ...referencesStepSchema.shape,
});

export type AdoptionFormValues = {
  housingType: 'house' | 'apartment' | 'condo' | 'other';
  ownOrRent: 'own' | 'rent';
  landlordApproval?: boolean;
  hasYard: boolean;
  householdSize: number;
  hasChildren: boolean;
  childrenAges?: number[];
  experienceLevel: 'none' | 'some' | 'experienced';
  hoursAlonePerDay: number;
  otherPets?: string;
  previousPets?: string;
  vetName?: string;
  vetPhone?: string;
  reasonForAdopting: string;
  references: { name: string; relationship: string; phone: string; email?: string }[];
  agreedToTerms: true;
};

export const STEP_SCHEMAS = [
  householdStepSchema,
  experienceStepSchema,
  motivationStepSchema,
  referencesStepSchema,
] as const;

export const STEP_FIELDS: (keyof AdoptionFormValues)[][] = [
  ['housingType', 'ownOrRent', 'landlordApproval', 'hasYard', 'householdSize', 'hasChildren', 'childrenAges'],
  ['experienceLevel', 'hoursAlonePerDay', 'otherPets', 'previousPets', 'vetName', 'vetPhone'],
  ['reasonForAdopting'],
  ['references', 'agreedToTerms'],
];

export const STEPS = [
  { title: 'Your home', description: 'Where the pet would live' },
  { title: 'Experience', description: 'Your history with animals' },
  { title: 'Why this pet', description: 'Tell the shelter about you' },
  { title: 'References', description: 'Optional, but they help' },
] as const;
