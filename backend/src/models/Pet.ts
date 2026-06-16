import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';
export type Gender = 'male' | 'female' | 'unknown';
export type PetSize = 'small' | 'medium' | 'large' | 'xlarge';
export type PetStatus = 'pending' | 'available' | 'reserved' | 'adopted' | 'archived';
export type Tristate = 'yes' | 'no' | 'unknown';

export interface IPetImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  isPrimary: boolean;
  order: number;
}

export interface IPet {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  species: Species;
  breed: string;
  age: { value: number; unit: 'weeks' | 'months' | 'years' };
  /** Derived on save so age-range filters ride one compound index instead of a computed $expr. */
  ageInMonths: number;
  gender: Gender;
  size: PetSize;
  weight?: { value: number; unit: 'kg' | 'lb' };
  color?: string;
  description: string;
  images: IPetImage[];
  health: {
    vaccinated: boolean;
    neutered: boolean;
    microchipped: boolean;
    specialNeeds: boolean;
    medicalNotes?: string;
  };
  temperament: string[];
  goodWith: { kids: Tristate; dogs: Tristate; cats: Tristate };
  activityLevel: 'low' | 'moderate' | 'high';
  adoptionFee: number;
  shelter: Types.ObjectId;
  status: PetStatus;
  adoptedBy?: Types.ObjectId;
  adoptedAt?: Date;
  /** Denormalised from the shelter so listing filters need no join. */
  location: {
    city: string;
    state: string;
    country: string;
    geo?: { type: 'Point'; coordinates: [number, number] };
  };
  views: number;
  favoritesCount: number;
  applicationsCount: number;
  featured: boolean;
  intakeDate?: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const petImageSchema = new Schema<IPetImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    width: Number,
    height: Number,
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const petSchema = new Schema<IPet>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    species: {
      type: String,
      enum: ['dog', 'cat', 'bird', 'rabbit', 'other'],
      required: true,
    },
    breed: { type: String, required: true, trim: true, maxlength: 80 },

    age: {
      value: { type: Number, required: true, min: 0, max: 40 },
      unit: { type: String, enum: ['weeks', 'months', 'years'], required: true },
    },
    ageInMonths: { type: Number, required: true, min: 0 },

    gender: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    size: { type: String, enum: ['small', 'medium', 'large', 'xlarge'], required: true },
    weight: {
      value: Number,
      unit: { type: String, enum: ['kg', 'lb'] },
    },
    color: String,

    description: { type: String, required: true, minlength: 30, maxlength: 3000 },

    images: {
      type: [petImageSchema],
      validate: [
        {
          validator: (images: IPetImage[]) => images.length >= 1 && images.length <= 8,
          message: 'A pet needs between 1 and 8 images.',
        },
        {
          // Exactly one primary, or the card and detail page disagree about which photo to show.
          validator: (images: IPetImage[]) => images.filter((i) => i.isPrimary).length === 1,
          message: 'Exactly one image must be marked as primary.',
        },
      ],
    },

    health: {
      vaccinated: { type: Boolean, default: false },
      neutered: { type: Boolean, default: false },
      microchipped: { type: Boolean, default: false },
      specialNeeds: { type: Boolean, default: false },
      medicalNotes: { type: String, maxlength: 1000 },
    },

    temperament: {
      type: [String],
      default: [],
      validate: {
        validator: (tags: string[]) => tags.length <= 8,
        message: 'At most 8 temperament tags.',
      },
    },

    goodWith: {
      kids: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
      dogs: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
      cats: { type: String, enum: ['yes', 'no', 'unknown'], default: 'unknown' },
    },

    activityLevel: { type: String, enum: ['low', 'moderate', 'high'], default: 'moderate' },
    adoptionFee: { type: Number, default: 0, min: 0 },

    shelter: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'available', 'reserved', 'adopted', 'archived'],
      default: 'pending',
    },
    adoptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adoptedAt: Date,

    location: {
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, default: 'USA' },
      geo: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] },
      },
    },

    views: { type: Number, default: 0 },
    favoritesCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    intakeDate: Date,

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// --- Indexes -----------------------------------------------------------------
// Each mirrors a query the listing page actually issues; see pets.service.ts.

/**
 * Sort indexes end with `_id` to match the queries.
 *
 * Batch 4 added `_id` as a tiebreaker to EVERY sort, to stop skip/limit pagination duplicating and
 * dropping rows where the sort key ties. The indexes were never updated to match, so from then on
 * the planner served `sort({createdAt:-1, _id:-1})` with an in-memory SORT stage — found by
 * `scripts/index-audit.ts` in Batch 15. An in-memory sort is capped at 32 MB and scans every
 * matching document first; it works fine at seed scale and falls over in production.
 *
 * The rule now: if a sort ends with `_id`, the index that serves it must too.
 */
petSchema.index({ status: 1, deletedAt: 1, createdAt: -1, _id: -1 });
petSchema.index({ species: 1, status: 1, ageInMonths: 1 });
petSchema.index({ shelter: 1, status: 1 });
petSchema.index({ featured: 1, status: 1 });
petSchema.index({ 'location.city': 1, status: 1 });
petSchema.index({ adoptionFee: 1 });
petSchema.index({ 'location.geo': '2dsphere' }, { sparse: true });
// Weighted so a name match outranks a breed match, which outranks a description mention.
petSchema.index(
  { name: 'text', breed: 'text', description: 'text' },
  { weights: { name: 10, breed: 5, description: 1 }, name: 'pet_text_search' },
);

const MONTHS_PER_UNIT = { weeks: 1 / 4.345, months: 1, years: 12 } as const;

/** Keeps the derived age field in step with whatever unit the shelter entered. */
petSchema.pre('save', function () {
  if (this.isModified('age')) {
    this.ageInMonths = Math.round(this.age.value * MONTHS_PER_UNIT[this.age.unit]);
  }
  if (this.isModified('status') && this.status === 'adopted' && !this.adoptedAt) {
    this.adoptedAt = new Date();
  }
});

export const Pet = (models.Pet as Model<IPet>) ?? model<IPet>('Pet', petSchema);
