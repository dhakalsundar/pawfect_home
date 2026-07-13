import { Types, isValidObjectId } from 'mongoose';
import { Review, type IReview, type ReviewStatus } from '../../models/Review.js';
import { Shelter } from '../../models/Shelter.js';
import { AdoptionApplication } from '../../models/AdoptionApplication.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildMeta } from '../../utils/ApiResponse.js';
import { logger } from '../../config/logger.js';
import { createNotification } from '../notifications/notifications.service.js';

export interface ReviewDTO {
  id: string;
  rating: number;
  title?: string;
  comment: string;
  images: { url: string }[];
  author: { id: string; name: string; avatar?: string };
  /** True when the author has a completed adoption with this shelter. */
  verified: boolean;
  status: ReviewStatus;
  helpfulCount: number;
  /** Whether the *current viewer* has marked it helpful — absent for anonymous readers. */
  markedHelpful?: boolean;
  shelterReply?: { body: string; at: string };
  shelter?: { id: string; name: string; slug: string };
  moderationNote?: string;
  createdAt: string;
}

interface Populated {
  _id: unknown;
  [key: string]: unknown;
}

export function toReviewDTO(review: IReview, viewerId?: string, includeModeration = false): ReviewDTO {
  const author = review.author as unknown as Populated;
  const shelter = review.shelter as unknown as Populated | undefined;

  return {
    id: String(review._id),
    rating: review.rating,
    ...(review.title ? { title: review.title } : {}),
    comment: review.comment,
    images: review.images.map((image) => ({ url: image.url })),
    author: {
      id: String(author?._id ?? ''),
      name: String(author?.name ?? 'Former adopter'),
      ...((author?.avatar as { url?: string } | undefined)?.url
        ? { avatar: (author.avatar as { url: string }).url }
        : {}),
    },
    verified: Boolean(review.adoptionApplication),
    status: review.status,
    helpfulCount: review.helpfulCount,
    ...(viewerId
      ? { markedHelpful: review.helpfulBy.some((id) => String(id) === viewerId) }
      : {}),
    ...(review.shelterReply?.body
      ? { shelterReply: { body: review.shelterReply.body, at: review.shelterReply.at.toISOString() } }
      : {}),
    ...(shelter?.name
      ? { shelter: { id: String(shelter._id), name: String(shelter.name), slug: String(shelter.slug) } }
      : {}),
    ...(includeModeration && review.moderationNote ? { moderationNote: review.moderationNote } : {}),
    createdAt: review.createdAt.toISOString(),
  };
}

/**
 * Recomputes a shelter's cached rating from its APPROVED reviews.
 *
 * Called after every state change that can affect the set — create, moderate, delete, restore.
 * Recomputing from scratch rather than incrementing: an incremental counter drifts the moment any
 * path forgets to adjust it, and drift in a public star rating is both invisible and permanent.
 * The aggregate is cheap and indexed on `{shelter, status}`.
 */
export async function recomputeShelterRating(shelterId: Types.ObjectId | string): Promise<void> {
  const id = typeof shelterId === 'string' ? new Types.ObjectId(shelterId) : shelterId;

  const [result] = await Review.aggregate<{ average: number; count: number }>([
    // Explicit ObjectId — aggregate() does not cast via the schema the way find() does.
    { $match: { shelter: id, targetType: 'shelter', status: 'approved', isActive: true } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Shelter.updateOne(
    { _id: id },
    {
      $set: {
        // Rounded to one decimal for display; the raw mean is not meaningful beyond that.
        'rating.average': result ? Math.round(result.average * 10) / 10 : 0,
        'rating.count': result?.count ?? 0,
      },
    },
  );
}

/** The rating histogram behind the distribution bars. */
export async function getRatingBreakdown(shelterId: string) {
  if (!isValidObjectId(shelterId)) throw ApiError.notFound('Shelter');

  const rows = await Review.aggregate<{ _id: number; count: number }>([
    {
      $match: {
        shelter: new Types.ObjectId(shelterId),
        targetType: 'shelter',
        status: 'approved',
        isActive: true,
      },
    },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;

  for (const row of rows) {
    distribution[row._id] = row.count;
    total += row.count;
    weighted += row._id * row.count;
  }

  return {
    average: total > 0 ? Math.round((weighted / total) * 10) / 10 : 0,
    count: total,
    distribution,
  };
}

export interface CreateReviewInput {
  shelterId: string;
  rating: number;
  title?: string;
  comment: string;
  images?: { url: string; publicId?: string }[];
}

export async function createReview(input: CreateReviewInput, authorId: string) {
  if (!isValidObjectId(input.shelterId)) throw ApiError.notFound('Shelter');

  const shelter = await Shelter.findOne({ _id: input.shelterId, deletedAt: null })
    .select('_id owner name status')
    .lean();
  if (!shelter) throw ApiError.notFound('Shelter');

  // Reviewing your own shelter would be self-dealing on a public rating.
  if (String(shelter.owner) === authorId) {
    throw ApiError.validation('You cannot review your own shelter.');
  }

  /**
   * The verified badge is earned, not claimed: it exists only if this author has a COMPLETED
   * adoption with this shelter. Anyone may still review — reviews from non-adopters are legitimate
   * — they simply do not carry the badge.
   */
  const completedAdoption = await AdoptionApplication.findOne({
    applicant: authorId,
    shelter: shelter._id,
    status: 'completed',
  })
    .select('_id')
    .lean();

  try {
    const review = await Review.create({
      author: authorId,
      targetType: 'shelter',
      shelter: shelter._id,
      rating: input.rating,
      ...(input.title ? { title: input.title } : {}),
      comment: input.comment,
      images: input.images ?? [],
      ...(completedAdoption ? { adoptionApplication: completedAdoption._id } : {}),
      status: 'pending',
    });

    if (shelter.owner) {
      await createNotification({
        recipient: shelter.owner,
        actor: authorId,
        type: 'new_review',
        title: `New ${input.rating}-star review`,
        body: 'It will appear publicly once a moderator approves it.',
        link: '/shelter/reviews',
        entity: { kind: 'review', id: review._id },
      });
    }

    await review.populate([
      { path: 'author', select: 'name avatar' },
      { path: 'shelter', select: 'name slug' },
    ]);

    return toReviewDTO(review.toObject() as IReview, authorId);
  } catch (error) {
    /**
     * The unique index rejected it. Translating 11000 here rather than pre-checking is deliberate:
     * the index is the only thing that closes the race between two concurrent submissions, so the
     * duplicate must be handled where it actually surfaces.
     */
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict('You have already reviewed this shelter.');
    }
    throw error;
  }
}

export interface ListReviewsQuery {
  shelterId?: string;
  rating?: number;
  page: number;
  limit: number;
  sort?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
}

/**
 * Public listing — approved reviews only.
 *
 * `status: 'approved'` is a query condition rather than a filter applied afterwards, so a pending
 * or rejected review cannot leak through any code path that forgets to check.
 */
export async function listReviews(query: ListReviewsQuery, viewerId?: string) {
  const filter: Record<string, unknown> = { status: 'approved', isActive: true };

  if (query.shelterId) {
    if (!isValidObjectId(query.shelterId)) throw ApiError.notFound('Shelter');
    filter.shelter = new Types.ObjectId(query.shelterId);
    filter.targetType = 'shelter';
  }
  if (query.rating) filter.rating = query.rating;

  // Every sort ends with `_id` — without a unique tiebreaker, skip/limit pagination duplicates and
  // drops rows wherever the sort key ties. See buildSort in pets.service.ts.
  const sorts: Record<string, Record<string, 1 | -1>> = {
    recent: { createdAt: -1, _id: -1 },
    helpful: { helpfulCount: -1, createdAt: -1, _id: -1 },
    rating_high: { rating: -1, createdAt: -1, _id: -1 },
    rating_low: { rating: 1, createdAt: -1, _id: -1 },
  };
  const sort = sorts[query.sort ?? 'recent'] ?? sorts.recent!;

  const skip = (query.page - 1) * query.limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.limit)
      .populate([
        { path: 'author', select: 'name avatar' },
        { path: 'shelter', select: 'name slug' },
      ])
      .lean<IReview[]>(),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map((review) => toReviewDTO(review, viewerId)),
    meta: buildMeta(total, query.page, query.limit),
  };
}

/** The author's own review of a shelter, whatever its moderation state. */
export async function getMyReview(shelterId: string, authorId: string) {
  if (!isValidObjectId(shelterId)) throw ApiError.notFound('Shelter');

  const review = await Review.findOne({
    author: authorId,
    shelter: shelterId,
    targetType: 'shelter',
    isActive: true,
  })
    .populate([
      { path: 'author', select: 'name avatar' },
      { path: 'shelter', select: 'name slug' },
    ])
    .lean<IReview>();

  return review ? toReviewDTO(review, authorId, true) : null;
}

const EDIT_WINDOW_DAYS = 30;

export async function updateReview(
  reviewId: string,
  authorId: string,
  updates: { rating?: number; title?: string; comment?: string },
) {
  // Ownership as a query condition — never fetch-then-compare.
  const review = await Review.findOne({ _id: reviewId, author: authorId, isActive: true });
  if (!review) throw ApiError.notFound('Review');

  const ageDays = (Date.now() - review.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays > EDIT_WINDOW_DAYS) {
    throw ApiError.validation(
      `Reviews can only be edited within ${EDIT_WINDOW_DAYS} days of posting.`,
    );
  }

  if (updates.rating !== undefined) review.rating = updates.rating;
  if (updates.title !== undefined) review.title = updates.title;
  if (updates.comment !== undefined) review.comment = updates.comment;

  /**
   * An edited review goes back through moderation. Otherwise an approved review is a blank cheque:
   * post something innocuous, wait for approval, then rewrite the body.
   */
  const wasApproved = review.status === 'approved';
  review.status = 'pending';
  review.moderatedBy = undefined;
  await review.save();

  // It was counted in the average and no longer is.
  if (wasApproved && review.shelter) await recomputeShelterRating(review.shelter);

  await review.populate([
    { path: 'author', select: 'name avatar' },
    { path: 'shelter', select: 'name slug' },
  ]);
  return toReviewDTO(review.toObject() as IReview, authorId, true);
}

/** Soft delete by the author or an admin. */
export async function deleteReview(reviewId: string, viewer: { id: string; role: string }) {
  const filter: Record<string, unknown> = { _id: reviewId, isActive: true };
  if (viewer.role !== 'admin') filter.author = viewer.id;

  const review = await Review.findOne(filter);
  if (!review) throw ApiError.notFound('Review');

  review.deletedAt = new Date();
  // `isActive` is synced by the pre-validate hook, which is what frees the unique-index slot so
  // the author can review this shelter again.
  await review.save();

  if (review.shelter) await recomputeShelterRating(review.shelter);

  return { deleted: true };
}

/** Idempotent helpful vote — a set membership, not a counter. */
export async function toggleHelpful(reviewId: string, userId: string) {
  const review = await Review.findOne({ _id: reviewId, status: 'approved', isActive: true });
  if (!review) throw ApiError.notFound('Review');

  if (String(review.author) === userId) {
    throw ApiError.validation('You cannot mark your own review as helpful.');
  }

  const alreadyMarked = review.helpfulBy.some((id) => String(id) === userId);

  /**
   * `$addToSet` / `$pull` with the count derived from the array's length, rather than `$inc`.
   * A raw increment lets a double-click — or a retried request — inflate the number without bound.
   */
  const updated = await Review.findByIdAndUpdate(
    reviewId,
    alreadyMarked
      ? { $pull: { helpfulBy: userId } }
      : { $addToSet: { helpfulBy: new Types.ObjectId(userId) } },
    { new: true },
  );

  const helpfulCount = updated?.helpfulBy.length ?? 0;
  await Review.updateOne({ _id: reviewId }, { $set: { helpfulCount } });

  return { helpfulCount, markedHelpful: !alreadyMarked };
}

/** The shelter owner's single reply to a review. */
export async function replyToReview(reviewId: string, body: string, viewer: { id: string; shelterId?: string }) {
  if (!viewer.shelterId) throw ApiError.forbidden('Only a shelter owner can reply to a review.');

  // Scoped to the replier's own shelter, so one shelter cannot answer another's reviews.
  const review = await Review.findOne({
    _id: reviewId,
    shelter: viewer.shelterId,
    status: 'approved',
    isActive: true,
  });
  if (!review) throw ApiError.notFound('Review');

  review.shelterReply = { body, at: new Date(), by: new Types.ObjectId(viewer.id) };
  await review.save();

  await createNotification({
    recipient: review.author,
    actor: viewer.id,
    type: 'new_review',
    title: 'A shelter replied to your review',
    body: body.slice(0, 140),
    link: `/shelters?review=${String(review._id)}`,
    entity: { kind: 'review', id: review._id },
  });

  await review.populate([
    { path: 'author', select: 'name avatar' },
    { path: 'shelter', select: 'name slug' },
  ]);
  return toReviewDTO(review.toObject() as IReview, viewer.id);
}

/** The admin moderation queue. */
export async function listForModeration(query: { status?: ReviewStatus; page: number; limit: number }) {
  const filter: Record<string, unknown> = { isActive: true };
  if (query.status) filter.status = query.status;

  const skip = (query.page - 1) * query.limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate([
        { path: 'author', select: 'name avatar' },
        { path: 'shelter', select: 'name slug' },
      ])
      .lean<IReview[]>(),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map((review) => toReviewDTO(review, undefined, true)),
    meta: buildMeta(total, query.page, query.limit),
  };
}

export async function moderateReview(
  reviewId: string,
  status: 'approved' | 'rejected',
  adminId: string,
  note?: string,
) {
  const review = await Review.findOne({ _id: reviewId, isActive: true });
  if (!review) throw ApiError.notFound('Review');

  review.status = status;
  review.moderatedBy = new Types.ObjectId(adminId);
  if (note) review.moderationNote = note;
  await review.save();

  /**
   * The whole point of the gate: the cached average must follow the moderation decision. Approving
   * adds the review to the mean, rejecting removes it — and rejecting an already-approved review
   * has to take it back out, which is why this recomputes unconditionally rather than only on
   * approve.
   */
  if (review.shelter) await recomputeShelterRating(review.shelter);

  await createNotification({
    recipient: review.author,
    type: 'new_review',
    title: status === 'approved' ? 'Your review is now live' : 'Your review was not published',
    body: note ?? undefined,
    link: '/dashboard/reviews',
    entity: { kind: 'review', id: review._id },
  });

  logger.info({ reviewId, status, adminId }, 'Review moderated');

  await review.populate([
    { path: 'author', select: 'name avatar' },
    { path: 'shelter', select: 'name slug' },
  ]);
  return toReviewDTO(review.toObject() as IReview, undefined, true);
}

/** Every review the signed-in user has written, in any state. */
export async function listMyReviews(authorId: string, page: number, limit: number) {
  const filter = { author: authorId, isActive: true };
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate([
        { path: 'author', select: 'name avatar' },
        { path: 'shelter', select: 'name slug' },
      ])
      .lean<IReview[]>(),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map((review) => toReviewDTO(review, authorId, true)),
    meta: buildMeta(total, page, limit),
  };
}
