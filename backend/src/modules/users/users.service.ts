import { randomBytes } from 'node:crypto';
import { User } from '../../models/User.js';
import { Favorite } from '../../models/Favorite.js';
import { AdoptionApplication } from '../../models/AdoptionApplication.js';
import { Donation } from '../../models/Donation.js';
import { Review } from '../../models/Review.js';
import { Notification } from '../../models/Notification.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { ApiError } from '../../utils/ApiError.js';
import { toPublicUser, revokeAllSessions } from '../auth/auth.service.js';
import { destroyAsset, verifyAsset } from '../upload/upload.service.js';
import { recordSecurityEvent } from '../security/security.service.js';

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  bio?: string;
  avatar?: { url: string; publicId: string };
  address?: Record<string, string | undefined>;
}

/** Empty strings from a cleared form field mean "unset", not "set to empty". */
function clean<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    output[key] = value === '' ? undefined : value;
  }
  return output as Partial<T>;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const update = clean(input as Record<string, unknown>);

  /**
   * Replacing an avatar deletes the old file. Verify the new one is genuinely ours first —
   * otherwise a crafted publicId could point at someone else's asset, and the old avatar would be
   * destroyed in exchange for a reference we cannot vouch for.
   */
  if (input.avatar?.publicId) {
    const valid = await verifyAsset(input.avatar.publicId);
    if (!valid) {
      throw ApiError.validation('That image could not be verified.', {
        avatar: 'Please upload the photo again.',
      });
    }

    const current = await User.findById(userId).select('avatar').lean();
    if (current?.avatar?.publicId && current.avatar.publicId !== input.avatar.publicId) {
      await destroyAsset(current.avatar.publicId);
    }
  }

  if (input.address) {
    // Merge rather than replace, so clearing one line does not wipe the rest of the address.
    const address = clean(input.address as Record<string, unknown>);
    delete update.address;
    for (const [key, value] of Object.entries(address)) {
      update[`address.${key}`] = value;
    }
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, deletedAt: null },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!user) throw ApiError.notFound('Account');
  return toPublicUser(user);
}

export async function updatePreferences(
  userId: string,
  input: Record<string, string | boolean | undefined>,
) {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) update[`preferences.${key}`] = value;
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, deletedAt: null },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!user) throw ApiError.notFound('Account');
  return toPublicUser(user);
}

export async function getStats(userId: string) {
  const [favorites, applications, activeApplications, adoptions] = await Promise.all([
    Favorite.countDocuments({ user: userId }),
    AdoptionApplication.countDocuments({ applicant: userId }),
    AdoptionApplication.countDocuments({ applicant: userId, isActive: true }),
    AdoptionApplication.countDocuments({ applicant: userId, status: 'completed' }),
  ]);

  return { favorites, applications, activeApplications, adoptions };
}

// --- Data portability (GDPR) -------------------------------------------------

/** Drops Mongo bookkeeping keys from a lean document before it goes in the export. */
function stripInternal<T extends object>(doc: T): Omit<T, '__v'> {
  const { __v, ...rest } = doc as T & { __v?: unknown };
  void __v;
  return rest as Omit<T, '__v'>;
}

/**
 * Assembles everything the platform holds about a user into a single JSON document — the GDPR
 * "right to data portability" (Art. 20). Only the requester's own records are gathered (ownership is
 * folded into every query, so there is no IDOR surface), and secrets are structurally excluded: the
 * password hash, TOTP secret, backup codes, password history and lockout state are all `select:false`
 * so a default query never loads them.
 */
export async function exportUserData(userId: string) {
  const user = await User.findOne({ _id: userId, deletedAt: null }).lean();
  if (!user) throw ApiError.notFound('Account');

  const [favorites, applications, donations, reviews, notifications, conversations, messages] =
    await Promise.all([
      Favorite.find({ user: userId }).populate('pet', 'name species breed').lean(),
      AdoptionApplication.find({ applicant: userId }).lean(),
      Donation.find({ donor: userId }).lean(),
      Review.find({ author: userId }).lean(),
      Notification.find({ recipient: userId }).lean(),
      Conversation.find({ participants: userId }).lean(),
      // Only the user's OWN messages — other participants' content is not theirs to export.
      Message.find({ sender: userId }).lean(),
    ]);

  await recordSecurityEvent({ event: 'DATA_EXPORTED', userId });

  return {
    format: 'pawfecthome-user-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      address: user.address,
      avatar: user.avatar,
      provider: user.provider,
      role: user.role,
      emailVerified: Boolean(user.emailVerified),
      twoFactorEnabled: Boolean(user.twoFactor?.enabled),
      preferences: user.preferences,
      stats: user.stats,
      createdAt: user.createdAt,
    },
    favorites: favorites.map(stripInternal),
    adoptionApplications: applications.map(stripInternal),
    donations: donations.map(stripInternal),
    reviews: reviews.map(stripInternal),
    notifications: notifications.map(stripInternal),
    conversations: conversations.map(stripInternal),
    messages: messages.map(stripInternal),
  };
}

export interface ImportProfileInput {
  name?: string;
  phone?: string;
  bio?: string;
  address?: Record<string, string | undefined>;
  preferences?: Record<string, string | boolean | undefined>;
}

/**
 * Restores the personalisation subset of a previous export. Deliberately narrow: only profile
 * fields and preferences are accepted — never role, status, ids, stats, applications or donations —
 * so a tampered import file cannot escalate privilege or forge records (mass-assignment defence).
 * Everything is re-validated by the route's zod schema before it reaches here.
 */
export async function importUserData(userId: string, input: ImportProfileInput) {
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.phone !== undefined) update.phone = input.phone || undefined;
  if (input.bio !== undefined) update.bio = input.bio || undefined;

  if (input.address) {
    for (const [key, value] of Object.entries(clean(input.address))) {
      update[`address.${key}`] = value;
    }
  }
  if (input.preferences) {
    for (const [key, value] of Object.entries(input.preferences)) {
      if (value !== undefined) update[`preferences.${key}`] = value;
    }
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, deletedAt: null },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();
  if (!user) throw ApiError.notFound('Account');

  await recordSecurityEvent({ event: 'DATA_IMPORTED', userId });
  return toPublicUser(user);
}

/**
 * Soft-deletes and anonymises.
 *
 * A hard delete would orphan adoption applications that shelters have a legitimate record of, and
 * break the adoption history of pets that were actually rehomed. Instead the personal data is
 * scrubbed, the account is closed, and every session is revoked.
 */
export async function deleteAccount(userId: string, password?: string): Promise<void> {
  const user = await User.findOne({ _id: userId, deletedAt: null }).select('+password');
  if (!user) throw ApiError.notFound('Account');

  // Credentials accounts must re-authenticate; a Google account has no password to check.
  if (user.provider === 'credentials') {
    if (!password) {
      throw ApiError.validation('Please enter your password to confirm.', {
        password: 'Password is required to delete your account.',
      });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      throw ApiError.validation('Incorrect password.', { password: 'Incorrect password.' });
    }
  }

  // The avatar is personal data; it goes with the account rather than lingering in storage.
  if (user.avatar?.publicId) await destroyAsset(user.avatar.publicId);

  // Randomised so the unique index still holds and the old address can be reused for a new signup.
  const anonymousId = randomBytes(8).toString('hex');
  user.name = 'Deleted user';
  user.email = `deleted-${anonymousId}@deleted.invalid`;
  user.phone = undefined;
  user.bio = undefined;
  user.avatar = undefined;
  user.address = undefined;
  user.googleId = undefined;
  user.status = 'suspended';
  user.deletedAt = new Date();
  user.tokenVersion += 1;
  await user.save({ validateBeforeSave: false });

  // Favourites are purely personal, so they go with the account.
  await Favorite.deleteMany({ user: userId });
  await revokeAllSessions(userId);
}
