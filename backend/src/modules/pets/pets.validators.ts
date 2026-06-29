import { z } from 'zod';

/**
 * Query strings arrive as strings, always. Every field here coerces and clamps rather than
 * rejecting, because a filter URL is user-editable and shareable — a slightly wrong `page=0`
 * should land on page 1, not throw a 422 at someone who pasted a link.
 */

/** Accepts `?species=dog` and `?species=dog,cat` alike. */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(',')
            .map((v) => v.trim().toLowerCase())
            .filter((v) => (values as readonly string[]).includes(v))
        : undefined,
    )
    .transform((list) => (list && list.length > 0 ? (list as T[number][]) : undefined));

const boolFlag = z
  .string()
  .optional()
  .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined));

export const petListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),

  species: csvEnum(['dog', 'cat', 'bird', 'rabbit', 'other'] as const),
  gender: csvEnum(['male', 'female', 'unknown'] as const),
  size: csvEnum(['small', 'medium', 'large', 'xlarge'] as const),
  activityLevel: csvEnum(['low', 'moderate', 'high'] as const),

  breed: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),

  // Expressed in months so the API speaks one unit; the UI converts from years.
  minAge: z.coerce.number().int().min(0).max(600).optional(),
  maxAge: z.coerce.number().int().min(0).max(600).optional(),

  minFee: z.coerce.number().min(0).max(10_000).optional(),
  maxFee: z.coerce.number().min(0).max(10_000).optional(),

  goodWithKids: boolFlag,
  goodWithDogs: boolFlag,
  goodWithCats: boolFlag,
  vaccinated: boolFlag,
  neutered: boolFlag,
  specialNeeds: boolFlag,

  status: z
    .enum(['available', 'reserved', 'adopted', 'pending', 'archived'])
    .optional()
    .default('available'),

  sort: z
    .enum(['newest', 'oldest', 'name', 'fee_asc', 'fee_desc', 'popular', 'relevance'])
    .optional()
    .default('newest'),

  page: z.coerce.number().int().positive().catch(1).default(1),
  // Capped at 48: a shelter could otherwise request limit=100000 and page a full table scan.
  limit: z.coerce.number().int().min(1).max(48).catch(24).default(24),
});

export type PetListQuery = z.infer<typeof petListQuerySchema>;

// --- Mutations (Batch 8) -----------------------------------------------------

const petImageSchema = z.object({
  url: z.string().url('Must be a valid image URL.'),
  publicId: z.string().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  isPrimary: z.boolean().optional(),
});

const petBodyShape = {
  name: z.string().trim().min(1, 'Name is required.').max(50),
  species: z.enum(['dog', 'cat', 'bird', 'rabbit', 'other']),
  breed: z.string().trim().min(1, 'Breed is required.').max(80),
  age: z.object({
    value: z.coerce.number().min(0).max(40),
    unit: z.enum(['weeks', 'months', 'years']),
  }),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  size: z.enum(['small', 'medium', 'large', 'xlarge']),
  weight: z
    .object({ value: z.coerce.number().positive(), unit: z.enum(['kg', 'lb']) })
    .optional(),
  color: z.string().trim().max(40).optional(),
  description: z
    .string()
    .trim()
    .min(30, 'Please write at least 30 characters — adopters rely on this.')
    .max(3000),
  images: z
    .array(petImageSchema)
    .min(1, 'At least one photo is required.')
    .max(8, 'At most 8 photos.'),
  // Zod 4 requires .default() to satisfy the schema's full OUTPUT type, so the whole object has to
  // be spelled out here rather than relying on the inner field defaults to fill in the gaps.
  health: z
    .object({
      vaccinated: z.boolean().default(false),
      neutered: z.boolean().default(false),
      microchipped: z.boolean().default(false),
      specialNeeds: z.boolean().default(false),
      medicalNotes: z.string().trim().max(1000).optional(),
    })
    .default({ vaccinated: false, neutered: false, microchipped: false, specialNeeds: false }),
  temperament: z.array(z.string().trim().max(30)).max(8).default([]),
  goodWith: z
    .object({
      kids: z.enum(['yes', 'no', 'unknown']).default('unknown'),
      dogs: z.enum(['yes', 'no', 'unknown']).default('unknown'),
      cats: z.enum(['yes', 'no', 'unknown']).default('unknown'),
    })
    .default({ kids: 'unknown', dogs: 'unknown', cats: 'unknown' }),
  activityLevel: z.enum(['low', 'moderate', 'high']).default('moderate'),
  // Whole NPR rupees (not minor units — adoption fees are round numbers set by the shelter).
  adoptionFee: z.coerce.number().min(0).max(100_000).default(0),
  intakeDate: z.coerce.date().optional(),
  /** Admins only — a shelter user's own shelter is taken from their session. */
  shelterId: z.string().trim().optional(),
};

export const createPetSchema = z.object(petBodyShape);
export type CreatePetInput = z.infer<typeof createPetSchema>;

/** Every field optional, but the same rules apply to whatever is present. */
export const updatePetSchema = z
  .object(petBodyShape)
  .partial()
  .extend({ status: z.string().optional() });
export type UpdatePetInput = z.infer<typeof updatePetSchema>;

export const setStatusSchema = z.object({
  status: z.enum(['available', 'reserved', 'adopted', 'archived']),
});

export const shelterPetsQuerySchema = z.object({
  status: z.enum(['pending', 'available', 'reserved', 'adopted', 'archived']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).catch(24).default(24),
});
export type ShelterPetsQuery = z.infer<typeof shelterPetsQuerySchema>;

export const petFacetsQuerySchema = petListQuerySchema.pick({
  q: true,
  species: true,
  city: true,
  state: true,
  status: true,
});

export type PetFacetsQuery = z.infer<typeof petFacetsQuerySchema>;
