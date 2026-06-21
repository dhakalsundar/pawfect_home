import { z } from 'zod';

const referenceSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(60),
  relationship: z.string().trim().min(2, 'Relationship is required.').max(60),
  phone: z.string().trim().min(6, 'A contact number is required.').max(24),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').optional().or(z.literal('')),
});

export const submitApplicationSchema = z.object({
  petId: z.string().trim().min(1, 'Pet is required.'),

  answers: z
    .object({
      housingType: z.enum(['house', 'apartment', 'condo', 'other']),
      ownOrRent: z.enum(['own', 'rent']),
      landlordApproval: z.boolean().optional(),
      hasYard: z.boolean().default(false),
      householdSize: z.coerce.number().int().min(1, 'At least one person.').max(20),
      hasChildren: z.boolean().default(false),
      childrenAges: z.array(z.coerce.number().int().min(0).max(25)).max(10).optional(),
      otherPets: z.string().trim().max(500).optional(),
      previousPets: z.string().trim().max(500).optional(),
      hoursAlonePerDay: z.coerce.number().int().min(0).max(24),
      experienceLevel: z.enum(['none', 'some', 'experienced']),
      reasonForAdopting: z
        .string()
        .trim()
        .min(30, 'Please write at least a couple of sentences (30 characters).')
        .max(1000, 'Please keep this under 1000 characters.'),
      vetName: z.string().trim().max(120).optional(),
      vetPhone: z.string().trim().max(24).optional(),
    })
    /**
     * Renters must confirm their landlord permits pets. Shelters reject on this constantly, and
     * catching it at submission saves both sides a wasted review cycle.
     */
    .refine((data) => data.ownOrRent !== 'rent' || data.landlordApproval === true, {
      message: 'Please confirm your landlord allows pets.',
      path: ['landlordApproval'],
    })
    // "Has children" with no ages is an incomplete answer, and shelters need the ages.
    .refine((data) => !data.hasChildren || (data.childrenAges?.length ?? 0) > 0, {
      message: 'Please add the age of each child.',
      path: ['childrenAges'],
    }),

  references: z.array(referenceSchema).max(3).default([]),

  agreedToTerms: z.literal(true, { message: 'You must agree to the adoption terms.' }),
});

export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

export const updateStatusSchema = z
  .object({
    status: z.enum(['under_review', 'approved', 'rejected', 'completed']),
    note: z.string().trim().max(1000).optional(),
  })
  // A rejection without a reason is the single worst experience in this flow. Required.
  .refine((data) => data.status !== 'rejected' || (data.note?.length ?? 0) >= 10, {
    message: 'Please give the applicant a reason (at least 10 characters).',
    path: ['note'],
  });

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const withdrawSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const scheduleMeetingSchema = z.object({
  meetingScheduledAt: z.coerce
    .date()
    .refine((date) => date.getTime() > Date.now(), { message: 'Pick a date in the future.' }),
  note: z.string().trim().max(500).optional(),
});

export const listApplicationsQuerySchema = z.object({
  status: z
    .enum(['pending', 'under_review', 'approved', 'rejected', 'withdrawn', 'completed'])
    .optional(),
  petId: z.string().trim().optional(),
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
});

export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
