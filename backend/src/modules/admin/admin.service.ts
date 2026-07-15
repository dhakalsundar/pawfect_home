import type { QueryFilter, Types } from 'mongoose';
import { User, type IUser, type UserRole, type UserStatus } from '../../models/User.js';
import { Shelter, type IShelter, type ShelterStatus } from '../../models/Shelter.js';
import { Pet, type IPet, type PetStatus } from '../../models/Pet.js';
import { AdoptionApplication } from '../../models/AdoptionApplication.js';
import { AuditLog, type AuditAction } from '../../models/AuditLog.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import { revokeAllSessions, toPublicUser } from '../auth/auth.service.js';
import { toPetListItem } from '../pets/pets.service.js';
import { createNotification } from '../notifications/notifications.service.js';
import type { AuthenticatedUser } from '../../types/express.js';

interface AuditContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Writes the audit entry. Never throws: an admin action that succeeded must not be reported as
 * failed because logging hiccuped — but a failure to log is loud in the server log.
 */
async function writeAudit(
  actor: AuthenticatedUser,
  entry: {
    action: AuditAction;
    entityKind: 'user' | 'shelter' | 'pet' | 'review' | 'report';
    entityId: Types.ObjectId;
    entityLabel?: string;
    before?: unknown;
    after?: unknown;
    note?: string;
  },
  context: AuditContext,
): Promise<void> {
  try {
    const actorUser = await User.findById(actor.id).select('name email').lean();
    await AuditLog.create({
      actor: actor.id,
      actorSnapshot: {
        name: actorUser?.name ?? 'Unknown',
        email: actorUser?.email ?? 'unknown',
      },
      ...entry,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  } catch (error) {
    logger.error({ err: error, entry }, 'Failed to write audit log entry');
  }
}

// --- Platform statistics -----------------------------------------------------

export async function getPlatformStats() {
  const [users, pets, applications, shelters, recentSignups, adoptionsByMonth] = await Promise.all([
    User.aggregate<{ _id: UserRole; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    Pet.aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AdoptionApplication.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Shelter.aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    User.countDocuments({
      deletedAt: null,
      createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
    }),
    AdoptionApplication.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'completed' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$updatedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]),
  ]);

  const tally = <T extends string>(rows: { _id: T; count: number }[]) =>
    Object.fromEntries(rows.map((row) => [row._id, row.count])) as Record<string, number>;

  const userCounts = tally(users);
  const petCounts = tally(pets);
  const applicationCounts = tally(applications);
  const shelterCounts = tally(shelters);

  const sum = (counts: Record<string, number>) =>
    Object.values(counts).reduce((total, value) => total + value, 0);

  return {
    users: {
      total: sum(userCounts),
      adopters: userCounts.user ?? 0,
      shelters: userCounts.shelter ?? 0,
      admins: userCounts.admin ?? 0,
      newLast30Days: recentSignups,
    },
    pets: {
      total: sum(petCounts),
      available: petCounts.available ?? 0,
      pending: petCounts.pending ?? 0,
      reserved: petCounts.reserved ?? 0,
      adopted: petCounts.adopted ?? 0,
      archived: petCounts.archived ?? 0,
    },
    shelters: {
      total: sum(shelterCounts),
      approved: shelterCounts.approved ?? 0,
      pending: shelterCounts.pending ?? 0,
      rejected: shelterCounts.rejected ?? 0,
      suspended: shelterCounts.suspended ?? 0,
    },
    applications: {
      total: sum(applicationCounts),
      pending: applicationCounts.pending ?? 0,
      underReview: applicationCounts.under_review ?? 0,
      approved: applicationCounts.approved ?? 0,
      completed: applicationCounts.completed ?? 0,
      rejected: applicationCounts.rejected ?? 0,
    },
    adoptionsByMonth: adoptionsByMonth.map((row) => ({ month: row._id, count: row.count })),
  };
}

// --- Users -------------------------------------------------------------------

export async function listUsers(query: {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  page: number;
  limit: number;
}) {
  const filter: QueryFilter<IUser> = { deletedAt: null };
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: users.map((user) => ({
      ...toPublicUser(user),
      lastLoginAt: user.lastLoginAt?.toISOString(),
    })),
    meta: buildMeta(total, query.page, query.limit),
  };
}

/**
 * Guards that must hold before an admin's own privileges can be reduced.
 *
 * Two separate protections:
 *  - self: an admin cannot demote or ban themselves, which would lock them out mid-action.
 *  - last admin: the platform must always retain at least one, or nobody can ever administer it
 *    again without direct database access.
 */
async function assertNotLastAdmin(targetId: string, actorId: string, verb: string): Promise<void> {
  if (targetId === actorId) {
    throw ApiError.forbidden(`You cannot ${verb} your own account.`);
  }

  const target = await User.findById(targetId).select('role').lean();
  if (target?.role !== 'admin') return;

  const admins = await User.countDocuments({ role: 'admin', status: 'active', deletedAt: null });
  if (admins <= 1) {
    throw ApiError.conflict('This is the last active admin — the platform must keep at least one.');
  }
}

export async function setUserRole(
  actor: AuthenticatedUser,
  userId: string,
  role: UserRole,
  context: AuditContext,
) {
  await assertNotLastAdmin(userId, actor.id, 'change the role of');

  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw ApiError.notFound('User');

  const before = user.role;
  if (before === role) return toPublicUser(user);

  user.role = role;
  // Demoting from shelter should not leave a dangling link to a shelter they no longer run.
  if (role !== 'shelter') user.shelterId = undefined;
  /**
   * Bumping tokenVersion invalidates every access token already issued for this user, so the new
   * role applies on their very next request rather than whenever their 15-minute token expires.
   */
  user.tokenVersion += 1;
  await user.save({ validateBeforeSave: false });

  await revokeAllSessions(user._id);

  await writeAudit(
    actor,
    {
      action: 'user.role_changed',
      entityKind: 'user',
      entityId: user._id,
      entityLabel: user.email,
      before: { role: before },
      after: { role },
    },
    context,
  );

  return toPublicUser(user);
}

export async function setUserStatus(
  actor: AuthenticatedUser,
  userId: string,
  status: UserStatus,
  note: string | undefined,
  context: AuditContext,
) {
  if (status !== 'active') {
    await assertNotLastAdmin(userId, actor.id, 'suspend or ban');
  } else if (userId === actor.id) {
    throw ApiError.forbidden('You cannot change your own account status.');
  }

  const user = await User.findOne({ _id: userId, deletedAt: null });
  if (!user) throw ApiError.notFound('User');

  const before = user.status;
  user.status = status;
  user.tokenVersion += 1;
  await user.save({ validateBeforeSave: false });

  // A banned or suspended user must lose their sessions immediately, not at token expiry.
  if (status !== 'active') await revokeAllSessions(user._id);

  await writeAudit(
    actor,
    {
      action: 'user.status_changed',
      entityKind: 'user',
      entityId: user._id,
      entityLabel: user.email,
      before: { status: before },
      after: { status },
      note,
    },
    context,
  );

  return toPublicUser(user);
}

// --- Shelters ----------------------------------------------------------------

export async function listShelters(query: { status?: string; page: number; limit: number }) {
  const filter: QueryFilter<IShelter> = { deletedAt: null };
  // The query schema keeps `status` a loose string so an unknown value simply matches nothing
  // rather than 422-ing a shareable admin URL; narrow it here for the typed filter.
  if (query.status) filter.status = query.status as ShelterStatus;

  const skip = (query.page - 1) * query.limit;

  const [shelters, total] = await Promise.all([
    Shelter.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('owner', 'name email')
      .lean(),
    Shelter.countDocuments(filter),
  ]);

  return {
    items: shelters.map((shelter) => ({
      id: String(shelter._id),
      name: shelter.name,
      slug: shelter.slug,
      email: shelter.email,
      phone: shelter.phone,
      description: shelter.description,
      status: shelter.status,
      rejectionReason: shelter.rejectionReason,
      city: shelter.address.city,
      state: shelter.address.state,
      registrationNumber: shelter.registrationNumber,
      stats: shelter.stats,
      rating: shelter.rating,
      createdAt: shelter.createdAt.toISOString(),
      owner: shelter.owner as unknown as { _id: unknown; name?: string; email?: string },
    })),
    meta: buildMeta(total, query.page, query.limit),
  };
}

export async function reviewShelter(
  actor: AuthenticatedUser,
  shelterId: string,
  status: 'approved' | 'rejected' | 'suspended',
  reason: string | undefined,
  context: AuditContext,
) {
  const shelter = await Shelter.findOne({ _id: shelterId, deletedAt: null });
  if (!shelter) throw ApiError.notFound('Shelter');

  const before = shelter.status;
  shelter.status = status;
  if (status === 'rejected' || status === 'suspended') {
    if (!reason || reason.trim().length < 10) {
      throw ApiError.validation('Please give a reason (at least 10 characters).', {
        reason: 'A reason is required.',
      });
    }
    shelter.rejectionReason = reason;
  } else {
    shelter.rejectionReason = undefined;
    shelter.verifiedAt = new Date();
    shelter.verifiedBy = actor.id as never;
  }
  await shelter.save({ validateBeforeSave: false });

  /**
   * Approving a shelter promotes its owner to the shelter role and links them.
   * The tokenVersion bump is what makes that role usable on their next request.
   */
  if (status === 'approved') {
    const owner = await User.findById(shelter.owner);
    if (owner && owner.role === 'user') {
      owner.role = 'shelter';
      owner.shelterId = shelter._id;
      owner.tokenVersion += 1;
      await owner.save({ validateBeforeSave: false });
      await revokeAllSessions(owner._id);
    }
  }

  // A suspended shelter's listings must come down with it.
  if (status === 'suspended') {
    await Pet.updateMany(
      { shelter: shelter._id, status: { $in: ['available', 'pending'] } },
      { $set: { status: 'archived' } },
    );
  }

  await createNotification({
    recipient: shelter.owner,
    actor: actor.id,
    type: status === 'approved' ? 'shelter_approved' : 'shelter_rejected',
    title:
      status === 'approved'
        ? `${shelter.name} has been approved`
        : `${shelter.name} was ${status}`,
    body:
      status === 'approved'
        ? 'You can now list pets for adoption.'
        : (reason ?? 'Please contact us for details.'),
    link: status === 'approved' ? '/shelter' : '/dashboard',
    entity: { kind: 'shelter', id: shelter._id },
  });

  await writeAudit(
    actor,
    {
      action:
        status === 'approved'
          ? 'shelter.approved'
          : status === 'rejected'
            ? 'shelter.rejected'
            : 'shelter.suspended',
      entityKind: 'shelter',
      entityId: shelter._id,
      entityLabel: shelter.name,
      before: { status: before },
      after: { status },
      note: reason,
    },
    context,
  );

  return { id: String(shelter._id), name: shelter.name, status: shelter.status };
}

// --- Pets --------------------------------------------------------------------

export async function listPetsForModeration(query: { status?: string; page: number; limit: number }) {
  const filter: QueryFilter<IPet> = { deletedAt: null };
  if (query.status) filter.status = query.status as PetStatus;

  const skip = (query.page - 1) * query.limit;

  const [pets, total] = await Promise.all([
    Pet.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('shelter', 'name slug')
      .lean<IPet[]>(),
    Pet.countDocuments(filter),
  ]);

  return { items: pets.map(toPetListItem), meta: buildMeta(total, query.page, query.limit) };
}

export async function moderatePet(
  actor: AuthenticatedUser,
  petId: string,
  action: 'approve' | 'reject' | 'feature' | 'unfeature',
  note: string | undefined,
  context: AuditContext,
) {
  const pet = await Pet.findOne({ _id: petId, deletedAt: null });
  if (!pet) throw ApiError.notFound('Pet');

  const before = { status: pet.status, featured: pet.featured };

  switch (action) {
    case 'approve':
      if (pet.status !== 'pending') {
        throw ApiError.conflict('Only pending listings can be approved.');
      }
      pet.status = 'available';
      await Shelter.updateOne(
        { _id: pet.shelter },
        { $inc: { 'stats.availablePets': 1 } },
      ).catch(() => undefined);
      break;

    case 'reject':
      if (!note || note.trim().length < 10) {
        throw ApiError.validation('Please tell the shelter why (at least 10 characters).', {
          note: 'A reason is required.',
        });
      }
      pet.status = 'archived';
      break;

    case 'feature':
      if (pet.status !== 'available') {
        throw ApiError.conflict('Only available pets can be featured.');
      }
      pet.featured = true;
      break;

    case 'unfeature':
      pet.featured = false;
      break;
  }

  await pet.save({ validateBeforeSave: false });

  const actionMap = {
    approve: 'pet.approved',
    reject: 'pet.rejected',
    feature: 'pet.featured',
    unfeature: 'pet.unfeatured',
  } as const;

  await writeAudit(
    actor,
    {
      action: actionMap[action],
      entityKind: 'pet',
      entityId: pet._id,
      entityLabel: pet.name,
      before,
      after: { status: pet.status, featured: pet.featured },
      note,
    },
    context,
  );

  // Tell the shelter their listing was approved or rejected — they cannot see the queue.
  if (action === 'approve' || action === 'reject') {
    const shelter = await Shelter.findById(pet.shelter).select('owner').lean();
    if (shelter?.owner) {
      await createNotification({
        recipient: shelter.owner,
        actor: actor.id,
        type: action === 'approve' ? 'pet_approved' : 'pet_rejected',
        title:
          action === 'approve'
            ? `${pet.name} is now live`
            : `${pet.name} was not approved`,
        body:
          action === 'approve'
            ? `Your listing for ${pet.name} has been approved and is visible to adopters.`
            : (note ?? 'Please review the listing and resubmit.'),
        link: '/shelter/pets',
        entity: { kind: 'pet', id: pet._id },
      });
    }
  }

  return toPetListItem(pet.toObject() as IPet);
}

// --- Audit log ---------------------------------------------------------------

export async function listAuditLogs(query: {
  action?: string;
  entityKind?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.entityKind) filter.entityKind = query.entityKind;

  const skip = (query.page - 1) * query.limit;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: logs.map((log) => ({
      id: String(log._id),
      actor: log.actorSnapshot,
      action: log.action,
      entityKind: log.entityKind,
      entityId: String(log.entityId),
      entityLabel: log.entityLabel,
      before: log.before,
      after: log.after,
      note: log.note,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    })),
    meta: buildMeta(total, query.page, query.limit),
  };
}
