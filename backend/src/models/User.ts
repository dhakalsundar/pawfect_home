import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { comparePassword, hashPassword } from '../utils/password.js';

// Mongoose ships as CommonJS, and Node's ESM loader cannot statically detect its named exports.
// Destructuring the default export is what actually works at runtime under "type": "module".
const { Schema, model, models } = mongoose;

export type UserRole = 'user' | 'shelter' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type AuthProvider = 'credentials' | 'google';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  provider: AuthProvider;
  googleId?: string;
  role: UserRole;
  shelterId?: Types.ObjectId;
  avatar?: { url: string; publicId: string };
  phone?: string;
  bio?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    geo?: { type: 'Point'; coordinates: [number, number] };
  };
  emailVerified: Date | null;
  status: UserStatus;
  /** Bumped to invalidate every access token already issued. See authenticate middleware. */
  tokenVersion: number;
  /** Consecutive failed logins. Reset to 0 on any successful sign-in. */
  failedLoginAttempts: number;
  /** When set and in the future, the account is locked and even a correct password is refused. */
  lockUntil: Date | null;
  /** bcrypt hashes of recent previous passwords, newest first, to block reuse. */
  passwordHistory: string[];
  /** When the current password was set — the basis for optional expiry. */
  passwordChangedAt?: Date;
  twoFactor: {
    enabled: boolean;
    /** AES-256-GCM ciphertext of the TOTP shared secret. Never leaves the server in the clear. */
    secret?: string;
    /** Same, held only during setup until the first code confirms the authenticator is paired. */
    pendingSecret?: string;
    /** SHA-256 hashes of single-use recovery codes; the plaintext is shown to the user just once. */
    backupCodes: string[];
    enabledAt?: Date;
  };
  preferences: {
    emailNotifications: boolean;
    pushNotifications: boolean;
    newsletter: boolean;
    theme: 'light' | 'dark' | 'system';
  };
  stats: { applications: number; adoptions: number; donationsTotal: number };
  lastLoginAt?: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, object, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [60, 'Name must be at most 60 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please enter a valid email address.'],
    },
    password: {
      type: String,
      // Google accounts never have one. Enforced at the schema level so a credentials
      // account can't be created without a password by some future code path.
      required: [
        function (this: IUser) {
          return this.provider === 'credentials';
        },
        'Password is required.',
      ],
      // Never returned by default — every query must opt in with .select('+password').
      select: false,
    },
    provider: { type: String, enum: ['credentials', 'google'], default: 'credentials' },
    googleId: { type: String, index: { unique: true, sparse: true } },

    role: { type: String, enum: ['user', 'shelter', 'admin'], default: 'user', index: true },
    shelterId: { type: Schema.Types.ObjectId, ref: 'Shelter' },

    avatar: {
      url: String,
      publicId: String,
    },
    phone: { type: String, trim: true, maxlength: 24 },
    bio: { type: String, trim: true, maxlength: [500, 'Bio must be at most 500 characters.'] },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zip: String,
      geo: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] },
      },
    },

    emailVerified: { type: Date, default: null },
    status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
    tokenVersion: { type: Number, default: 0 },
    // Brute-force lockout state. Never surfaced by toPublicUser, so it stays server-side.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    // Reuse prevention. select:false so the old hashes never ride along on an ordinary read.
    passwordHistory: { type: [String], default: [], select: false },
    passwordChangedAt: { type: Date },
    // Multi-factor. Only `enabled` is ever read outside the auth service; the secret and codes are
    // select:false so an ordinary query cannot accidentally load, log, or serialise them.
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
      backupCodes: { type: [String], default: [], select: false },
      enabledAt: { type: Date },
    },

    preferences: {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      newsletter: { type: Boolean, default: false },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    },

    stats: {
      applications: { type: Number, default: 0 },
      adoptions: { type: Number, default: 0 },
      donationsTotal: { type: Number, default: 0 },
    },

    lastLoginAt: Date,
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'address.geo': '2dsphere' }, { sparse: true });

/**
 * Hash on save, but only when the password actually changed — otherwise every profile update
 * would re-hash the existing hash and lock the user out.
 *
 * Returns a promise rather than taking `next`: mongoose supports async middleware directly, and
 * the callback overload does not narrow correctly against this schema's generics.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await hashPassword(this.password);
});

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  if (!this.password) return Promise.resolve(false);
  return comparePassword(candidate, this.password);
};

export const User = (models.User as UserModel) ?? model<IUser, UserModel>('User', userSchema);
