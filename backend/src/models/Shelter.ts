import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

// See the note in User.ts — mongoose is CJS, so named ESM imports fail at runtime.
const { Schema, model, models } = mongoose;

export type ShelterStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface IShelter {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  owner: Types.ObjectId;
  email: string;
  phone?: string;
  website?: string;
  description: string;
  logo?: { url: string; publicId: string };
  coverImage?: { url: string; publicId: string };
  address: {
    street?: string;
    city: string;
    state: string;
    country: string;
    zip?: string;
    geo?: { type: 'Point'; coordinates: [number, number] };
  };
  registrationNumber?: string;
  status: ShelterStatus;
  rejectionReason?: string;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  socials?: { facebook?: string; instagram?: string; twitter?: string };
  rating: { average: number; count: number };
  stats: {
    totalPets: number;
    availablePets: number;
    adoptedPets: number;
    applicationsReceived: number;
    donationsTotal: number;
  };
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const shelterSchema = new Schema<IShelter>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },

    description: { type: String, required: true, minlength: 50, maxlength: 2000 },
    logo: { url: String, publicId: String },
    coverImage: { url: String, publicId: String },

    address: {
      street: String,
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true, default: 'USA' },
      zip: String,
      geo: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] },
      },
    },

    registrationNumber: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
      index: true,
    },
    rejectionReason: String,
    verifiedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    socials: { facebook: String, instagram: String, twitter: String },

    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },

    stats: {
      totalPets: { type: Number, default: 0 },
      availablePets: { type: Number, default: 0 },
      adoptedPets: { type: Number, default: 0 },
      applicationsReceived: { type: Number, default: 0 },
      donationsTotal: { type: Number, default: 0 },
    },

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

shelterSchema.index({ 'address.city': 1, status: 1 });
shelterSchema.index({ 'address.geo': '2dsphere' }, { sparse: true });
shelterSchema.index({ name: 'text', description: 'text' });

export const Shelter =
  (models.Shelter as Model<IShelter>) ?? model<IShelter>('Shelter', shelterSchema);
