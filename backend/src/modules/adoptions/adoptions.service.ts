import type { QueryFilter } from 'mongoose';
import {
  AdoptionApplication,
  ACTIVE_STATUSES,
  type ApplicationStatus,
  type IAdoptionApplication,
} from '../../models/AdoptionApplication.js';
import { Pet } from '../../models/Pet.js';
import { User } from '../../models/User.js';
import { Shelter } from '../../models/Shelter.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import type { AuthenticatedUser } from '../../types/express.js';
import { createNotification } from '../notifications/notifications.service.js';
import {
  sendApplicationReceivedEmail,
  sendApplicationSubmittedEmail,
  sendStatusChangedEmail,
} from './adoptions.emails.js';
import type {
  ListApplicationsQuery,
  SubmitApplicationInput,
  UpdateStatusInput,
} from './adoptions.validators.js';

/**
 * The legal state machine. Anything not listed is a 409.
 *
 * Encoded as data rather than a pile of ifs so the rules are readable in one place, and so the
 * frontend can be given the same table if it ever needs to grey out buttons.
 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['under_review', 'approved', 'rejected', 'withdrawn'],
  under_review: ['approved', 'rejected', 'withdrawn'],
  approved: ['completed', 'rejected', 'withdrawn'],
  rejected: [],
  withdrawn: [],
  completed: [],
};

/** Notification headlines, written for the person receiving them rather than as status codes. */
const STATUS_NOTIFICATION_TITLES: Partial<Record<ApplicationStatus, string>> = {
  under_review: 'Your application is being reviewed',
  approved: 'Your application was approved',
  rejected: 'An update on your application',
  completed: 'Your adoption is complete',
};

function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw ApiError.conflict(
      `An application that is ${from.replace('_', ' ')} cannot be changed to ${to.replace('_', ' ')}.`,
    );
  }
}

export interface ApplicationDTO {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  applicantSnapshot: IAdoptionApplication['applicantSnapshot'];
  answers: IAdoptionApplication['answers'];
  references: IAdoptionApplication['references'];
  reviewNote?: string;
  withdrawnReason?: string;
  meetingScheduledAt?: string;
  statusHistory: { status: ApplicationStatus; note?: string; at: string }[];
  pet?: { id: string; slug: string; name: string; breed: string; image: string; status: string };
  shelter?: { id: string; name: string; slug: string };
  applicant?: { id: string; name: string; email: string };
}

interface PopulatedRef {
  _id: unknown;
  [key: string]: unknown;
}

export function toApplicationDTO(application: IAdoptionApplication): ApplicationDTO {
  const pet = application.pet as unknown as PopulatedRef | undefined;
  const shelter = application.shelter as unknown as PopulatedRef | undefined;
  const applicant = application.applicant as unknown as PopulatedRef | undefined;

  const images = (pet?.images as { url: string; isPrimary: boolean }[] | undefined) ?? [];
  const primary = images.find((image) => image.isPrimary) ?? images[0];

  return {
    id: String(application._id),
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    applicantSnapshot: application.applicantSnapshot,
    answers: application.answers,
    references: application.references,
    ...(application.reviewNote ? { reviewNote: application.reviewNote } : {}),
    ...(application.withdrawnReason ? { withdrawnReason: application.withdrawnReason } : {}),
    ...(application.meetingScheduledAt
      ? { meetingScheduledAt: application.meetingScheduledAt.toISOString() }
      : {}),
    statusHistory: application.statusHistory.map((entry) => ({
      status: entry.status,
      ...(entry.note ? { note: entry.note } : {}),
      at: entry.at.toISOString(),
    })),
    ...(pet?.name
      ? {
          pet: {
            id: String(pet._id),
            slug: String(pet.slug ?? ''),
            name: String(pet.name),
            breed: String(pet.breed ?? ''),
            image: primary?.url ?? '',
            status: String(pet.status ?? ''),
          },
        }
      : {}),
    ...(shelter?.name
      ? { shelter: { id: String(shelter._id), name: String(shelter.name), slug: String(shelter.slug ?? '') } }
      : {}),
    ...(applicant?.name
      ? {
          applicant: {
            id: String(applicant._id),
            name: String(applicant.name),
            email: String(applicant.email ?? ''),
          },
        }
      : {}),
  };
}

const PET_FIELDS = 'slug name breed images status';

// --- Submit ------------------------------------------------------------------

export async function submitApplication(user: AuthenticatedUser, input: SubmitApplicationInput) {
  const pet = await Pet.findOne({ _id: input.petId, deletedAt: null }).lean();
  if (!pet) throw ApiError.notFound('Pet');

  if (pet.status !== 'available') {
    throw ApiError.conflict(`${pet.name} is no longer accepting applications.`);
  }

  // A shelter applying for its own animal would be able to approve itself.
  if (user.shelterId && String(pet.shelter) === user.shelterId) {
    throw ApiError.forbidden('You cannot apply to adopt a pet from your own shelter.');
  }

  const applicant = await User.findById(user.id).lean();
  if (!applicant) throw ApiError.notFound('Account');

  try {
    const application = await AdoptionApplication.create({
      pet: pet._id,
      shelter: pet.shelter,
      applicant: applicant._id,
      status: 'pending',
      isActive: true,
      applicantSnapshot: {
        name: applicant.name,
        email: applicant.email,
        ...(applicant.phone ? { phone: applicant.phone } : {}),
      },
      answers: input.answers,
      references: input.references.filter((ref) => ref.name),
      agreedToTerms: input.agreedToTerms,
      statusHistory: [{ status: 'pending', changedBy: applicant._id, at: new Date() }],
    });

    // Counters are denormalised; a failure here must not fail the submission.
    await Promise.all([
      Pet.updateOne({ _id: pet._id }, { $inc: { applicationsCount: 1 } }),
      User.updateOne({ _id: applicant._id }, { $inc: { 'stats.applications': 1 } }),
      Shelter.updateOne({ _id: pet.shelter }, { $inc: { 'stats.applicationsReceived': 1 } }),
    ]).catch((error: unknown) => logger.error({ err: error }, 'Failed to update application counters'));

    const shelter = await Shelter.findById(pet.shelter).lean();

    await Promise.all([
      sendApplicationSubmittedEmail(applicant.email, applicant.name, pet.name, shelter?.name ?? 'the shelter'),
      shelter?.email
        ? sendApplicationReceivedEmail(shelter.email, shelter.name, pet.name, applicant.name)
        : Promise.resolve(),
    ]);

    // In-app notification for the shelter owner, delivered live if they are online.
    if (shelter?.owner) {
      await createNotification({
        recipient: shelter.owner,
        actor: applicant._id,
        type: 'application_submitted',
        title: `New application for ${pet.name}`,
        body: `${applicant.name} has applied to adopt ${pet.name}.`,
        link: '/shelter/applications',
        entity: { kind: 'application', id: application._id },
      });
    }

    await application.populate([
      { path: 'pet', select: PET_FIELDS },
      { path: 'shelter', select: 'name slug' },
    ]);

    return toApplicationDTO(application.toObject() as IAdoptionApplication);
  } catch (error) {
    // 11000 from the unique partial index — the applicant already has an open application.
    if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
      throw ApiError.conflict(`You already have an open application for ${pet.name}.`);
    }
    throw error;
  }
}

// --- Read --------------------------------------------------------------------

/**
 * Scopes the query to what this user may see. This is the authorization, expressed as query
 * conditions rather than a post-fetch check — a user cannot express a query that reaches someone
 * else's rows in the first place.
 *
 * A shelter user gets applications made TO their shelter *or* BY them personally. Scoping purely
 * by role would hide a shelter staffer's own application to a different shelter from them — they
 * are an adopter in that context, not an administrator.
 */
function scopeFor(user: AuthenticatedUser): QueryFilter<IAdoptionApplication> {
  if (user.role === 'admin') return {};

  if (user.role === 'shelter' && user.shelterId) {
    return { $or: [{ shelter: user.shelterId }, { applicant: user.id }] };
  }

  return { applicant: user.id };
}

export async function listApplications(user: AuthenticatedUser, query: ListApplicationsQuery) {
  const filter: QueryFilter<IAdoptionApplication> = { ...scopeFor(user) };
  if (query.status) filter.status = query.status;
  if (query.petId) filter.pet = query.petId;

  const skip = (query.page - 1) * query.limit;

  const [applications, total] = await Promise.all([
    AdoptionApplication.find(filter)
      // _id tiebreaker for the same reason as the pet listing: createdAt ties would make
      // pagination silently drop and duplicate rows.
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate('pet', PET_FIELDS)
      .populate('shelter', 'name slug')
      .populate('applicant', 'name email')
      .lean<IAdoptionApplication[]>(),
    AdoptionApplication.countDocuments(filter),
  ]);

  return {
    items: applications.map(toApplicationDTO),
    meta: buildMeta(total, query.page, query.limit),
  };
}

export async function getApplication(user: AuthenticatedUser, id: string) {
  const application = await AdoptionApplication.findOne({ _id: id, ...scopeFor(user) })
    .populate('pet', PET_FIELDS)
    .populate('shelter', 'name slug')
    .populate('applicant', 'name email')
    .lean<IAdoptionApplication>();

  // Scoped find means "not yours" and "doesn't exist" are indistinguishable, by design.
  if (!application) throw ApiError.notFound('Application');
  return toApplicationDTO(application);
}

// --- Status transitions ------------------------------------------------------

export async function updateStatus(user: AuthenticatedUser, id: string, input: UpdateStatusInput) {
  const scope =
    user.role === 'admin' ? {} : { shelter: user.shelterId ?? '__none__' };

  const application = await AdoptionApplication.findOne({ _id: id, ...scope });
  if (!application) throw ApiError.notFound('Application');

  assertTransition(application.status, input.status);

  application.status = input.status;
  if (input.note) application.reviewNote = input.note;
  application.statusHistory.push({
    status: input.status,
    changedBy: user.id as never,
    ...(input.note ? { note: input.note } : {}),
    at: new Date(),
  });
  await application.save();

  /**
   * Completing an adoption marks the pet adopted and closes every other open application for it.
   * Leaving those pending would have people waiting on an animal that has already gone home.
   */
  if (input.status === 'completed') {
    await Pet.updateOne(
      { _id: application.pet },
      { status: 'adopted', adoptedBy: application.applicant, adoptedAt: new Date() },
    );

    const others = await AdoptionApplication.find({
      pet: application.pet,
      _id: { $ne: application._id },
      status: { $in: ['pending', 'under_review', 'approved'] },
    }).populate('pet', 'name');

    for (const other of others) {
      other.status = 'rejected';
      other.isActive = false;
      other.reviewNote = 'This pet has been adopted by another applicant.';
      other.statusHistory.push({
        status: 'rejected',
        changedBy: user.id as never,
        note: 'This pet has been adopted by another applicant.',
        at: new Date(),
      });
      await other.save();

      const petName = (other.pet as unknown as { name?: string })?.name ?? 'the pet';
      await sendStatusChangedEmail(
        other.applicantSnapshot.email,
        other.applicantSnapshot.name,
        petName,
        'rejected',
        'This pet has been adopted by another applicant.',
      );
    }

    await Promise.all([
      User.updateOne({ _id: application.applicant }, { $inc: { 'stats.adoptions': 1 } }),
      Shelter.updateOne(
        { _id: application.shelter },
        { $inc: { 'stats.adoptedPets': 1, 'stats.availablePets': -1 } },
      ),
    ]).catch((error: unknown) => logger.error({ err: error }, 'Failed to update adoption counters'));
  }

  // Reserve the pet while an approved applicant is arranging collection.
  if (input.status === 'approved') {
    await Pet.updateOne({ _id: application.pet, status: 'available' }, { status: 'reserved' });
  }

  await application.populate([
    { path: 'pet', select: PET_FIELDS },
    { path: 'shelter', select: 'name slug' },
  ]);

  const petName = (application.pet as unknown as { name?: string })?.name ?? 'the pet';
  await sendStatusChangedEmail(
    application.applicantSnapshot.email,
    application.applicantSnapshot.name,
    petName,
    input.status,
    input.note,
  );

  await createNotification({
    recipient: application.applicant,
    actor: user.id,
    type: 'application_status_changed',
    title: STATUS_NOTIFICATION_TITLES[input.status] ?? 'Your application was updated',
    body: `Your application to adopt ${petName} is now ${input.status.replace('_', ' ')}.`,
    link: `/dashboard/applications/${String(application._id)}`,
    entity: { kind: 'application', id: application._id },
  });

  return toApplicationDTO(application.toObject() as IAdoptionApplication);
}

export async function withdrawApplication(user: AuthenticatedUser, id: string, reason?: string) {
  // Scoped to the applicant: only the person who applied may withdraw.
  const application = await AdoptionApplication.findOne({ _id: id, applicant: user.id });
  if (!application) throw ApiError.notFound('Application');

  assertTransition(application.status, 'withdrawn');

  application.status = 'withdrawn';
  application.isActive = false;
  if (reason) application.withdrawnReason = reason;
  application.statusHistory.push({
    status: 'withdrawn',
    changedBy: user.id as never,
    ...(reason ? { note: reason } : {}),
    at: new Date(),
  });
  await application.save();

  // Free the pet again if this application had reserved it.
  await Pet.updateOne({ _id: application.pet, status: 'reserved' }, { status: 'available' });

  await application.populate([
    { path: 'pet', select: PET_FIELDS },
    { path: 'shelter', select: 'name slug' },
  ]);

  return toApplicationDTO(application.toObject() as IAdoptionApplication);
}

export async function scheduleMeeting(
  user: AuthenticatedUser,
  id: string,
  meetingScheduledAt: Date,
  note?: string,
) {
  const scope = user.role === 'admin' ? {} : { shelter: user.shelterId ?? '__none__' };

  const application = await AdoptionApplication.findOne({ _id: id, ...scope });
  if (!application) throw ApiError.notFound('Application');

  if (!ACTIVE_STATUSES.includes(application.status)) {
    throw ApiError.conflict('This application is closed and cannot be scheduled.');
  }

  application.meetingScheduledAt = meetingScheduledAt;
  application.statusHistory.push({
    status: application.status,
    changedBy: user.id as never,
    note: note ?? `Meeting scheduled for ${meetingScheduledAt.toISOString()}`,
    at: new Date(),
  });
  await application.save();

  await application.populate([
    { path: 'pet', select: PET_FIELDS },
    { path: 'shelter', select: 'name slug' },
  ]);

  return toApplicationDTO(application.toObject() as IAdoptionApplication);
}

/** Powers the "you have already applied" state on the pet detail page. */
export async function getApplicationForPet(userId: string, petId: string) {
  const application = await AdoptionApplication.findOne({
    applicant: userId,
    pet: petId,
    isActive: true,
  }).lean<IAdoptionApplication>();

  return application ? { id: String(application._id), status: application.status } : null;
}
