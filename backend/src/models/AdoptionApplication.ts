import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type ApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'completed';

/** Statuses that still occupy the applicant's "one open application per pet" slot. */
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  'pending',
  'under_review',
  'approved',
  'completed',
];

export interface IStatusChange {
  status: ApplicationStatus;
  changedBy: Types.ObjectId;
  note?: string;
  at: Date;
}

export interface IAdoptionApplication {
  _id: Types.ObjectId;
  pet: Types.ObjectId;
  shelter: Types.ObjectId;
  applicant: Types.ObjectId;
  status: ApplicationStatus;
  /**
   * Mirrors `status`, purely to support the unique partial index below.
   * MongoDB's partialFilterExpression does not accept $nin/$ne/$in, so "not rejected or withdrawn"
   * cannot be expressed directly — a boolean it *can* index is maintained instead.
   */
  isActive: boolean;
  applicantSnapshot: { name: string; email: string; phone?: string };
  answers: {
    housingType: 'house' | 'apartment' | 'condo' | 'other';
    ownOrRent: 'own' | 'rent';
    landlordApproval?: boolean;
    hasYard: boolean;
    householdSize: number;
    hasChildren: boolean;
    childrenAges?: number[];
    otherPets?: string;
    previousPets?: string;
    hoursAlonePerDay: number;
    experienceLevel: 'none' | 'some' | 'experienced';
    reasonForAdopting: string;
    vetName?: string;
    vetPhone?: string;
  };
  references: { name: string; relationship: string; phone: string; email?: string }[];
  agreedToTerms: boolean;
  statusHistory: IStatusChange[];
  reviewNote?: string;
  meetingScheduledAt?: Date;
  withdrawnReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const statusChangeSchema = new Schema<IStatusChange>(
  {
    status: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const adoptionApplicationSchema = new Schema<IAdoptionApplication>(
  {
    pet: { type: Schema.Types.ObjectId, ref: 'Pet', required: true, index: true },
    shelter: { type: Schema.Types.ObjectId, ref: 'Shelter', required: true, index: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'withdrawn', 'completed'],
      default: 'pending',
    },
    isActive: { type: Boolean, default: true },

    // Frozen at submission: if the applicant later edits their profile, the shelter must still see
    // the contact details the application was actually made with.
    applicantSnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
    },

    answers: {
      housingType: {
        type: String,
        enum: ['house', 'apartment', 'condo', 'other'],
        required: true,
      },
      ownOrRent: { type: String, enum: ['own', 'rent'], required: true },
      landlordApproval: Boolean,
      hasYard: { type: Boolean, default: false },
      householdSize: { type: Number, required: true, min: 1, max: 20 },
      hasChildren: { type: Boolean, default: false },
      childrenAges: [{ type: Number, min: 0, max: 25 }],
      otherPets: { type: String, maxlength: 500 },
      previousPets: { type: String, maxlength: 500 },
      hoursAlonePerDay: { type: Number, required: true, min: 0, max: 24 },
      experienceLevel: {
        type: String,
        enum: ['none', 'some', 'experienced'],
        required: true,
      },
      reasonForAdopting: { type: String, required: true, minlength: 30, maxlength: 1000 },
      vetName: String,
      vetPhone: String,
    },

    references: [
      {
        _id: false,
        name: { type: String, required: true },
        relationship: { type: String, required: true },
        phone: { type: String, required: true },
        email: String,
      },
    ],

    agreedToTerms: {
      type: Boolean,
      required: true,
      validate: {
        validator: (value: boolean) => value === true,
        message: 'You must agree to the adoption terms.',
      },
    },

    statusHistory: { type: [statusChangeSchema], default: [] },
    reviewNote: { type: String, maxlength: 1000 },
    meetingScheduledAt: Date,
    withdrawnReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

/**
 * One open application per person per pet, enforced by the database rather than by a check in the
 * service — a read-then-write check races against itself under concurrent submissions.
 *
 * Rejected and withdrawn applications are excluded (isActive false), so someone whose application
 * was turned down can apply again if circumstances change.
 */
adoptionApplicationSchema.index(
  { applicant: 1, pet: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: 'one_active_per_applicant_pet' },
);

adoptionApplicationSchema.index({ shelter: 1, status: 1, createdAt: -1, _id: -1 });
adoptionApplicationSchema.index({ applicant: 1, createdAt: -1, _id: -1 });
adoptionApplicationSchema.index({ pet: 1, status: 1 });

/** Keeps the indexed flag in step with status, so no call site has to remember. */
adoptionApplicationSchema.pre('save', function () {
  if (this.isModified('status')) {
    this.isActive = ACTIVE_STATUSES.includes(this.status);
  }
});

export const AdoptionApplication =
  (models.AdoptionApplication as Model<IAdoptionApplication>) ??
  model<IAdoptionApplication>('AdoptionApplication', adoptionApplicationSchema);
